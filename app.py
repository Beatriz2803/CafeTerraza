from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = "una_clave_secreta_muy_segura"
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cafeteria.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login_page"

# --- BASE DE DATOS
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Producto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    categoria = db.Column(db.String(50))
    precio = db.Column(db.Float, nullable=False)
    imagen_url = db.Column(db.String(200), nullable=True)

class Pedido(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    cliente = db.Column(db.String(100))
    descripcion = db.Column(db.Text)
    total = db.Column(db.Float)
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    mesa = db.Column(db.String(50), nullable=True)  # Nueva columna
    items = db.relationship("PedidoItem", backref="pedido", cascade="all, delete-orphan")

class Mesa(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.Integer, unique=True, nullable=False)
    estado = db.Column(db.String(20), default="Libre")
    cliente_reserva = db.Column(db.String(100), nullable=True)
    personas_reserva = db.Column(db.Integer, nullable=True)
    fecha_hora_reserva = db.Column(db.DateTime, nullable=True)

class PedidoItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey("pedido.id"), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey("producto.id"), nullable=False)
    cantidad = db.Column(db.Integer, default=1)
    producto = db.relationship("Producto")

class Factura(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pedido_id = db.Column(db.Integer, db.ForeignKey("pedido.id"), unique=True, nullable=False)
    total = db.Column(db.Float, nullable=False)
    metodo_pago = db.Column(db.String(20))
    fecha = db.Column(db.DateTime, default=datetime.utcnow)
    pedido = db.relationship("Pedido")

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

# --- RUTAS BÁSICAS ---
@app.route("/")
@app.route("/")
def home():
    if current_user.is_authenticated:
        if current_user.role == "cliente":
            return redirect(url_for("dashboard_cliente"))
        return redirect(url_for("dashboard_page"))
    return redirect(url_for("login_page"))

@app.route("/login")
def login_page():
    return render_template("index.html")

# Dashboard del personal
@app.route("/dashboard")
@login_required
def dashboard_page():
    return render_template("dashboard.html", user=current_user)


# Dashboard del cliente
@app.route("/dashboard_cliente")
@login_required
def dashboard_cliente():
    return render_template("dashboard_cliente.html", user=current_user)


# Reservas (solo clientes)
@app.route("/reservas")
@login_required
def reservas_page():
    if current_user.role != "cliente":
        return redirect(url_for("dashboard_page"))
    return render_template("reservas.html", user=current_user)



# --- AUTENTICACIÓN ---
@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"success": False, "message": "Usuario y contraseña requeridos"}), 400
    
    user = User.query.filter_by(username=data["username"]).first()
    if user and user.check_password(data["password"]):
        login_user(user)
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Credenciales inválidas"}), 401

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login_page"))

# --- PRODUCTOS ---
@app.route("/api/menu", methods=["GET"])
@login_required
def api_menu():
    productos = Producto.query.all()
    return jsonify([{
        "id": p.id,
        "nombre": p.nombre,
        "categoria": p.categoria,
        "precio": p.precio,
        "imagen_url": url_for('static', filename=f'images/{p.imagen_url}')
    } for p in productos])

# crear, editar, eliminar productos
@app.route("/api/menu", methods=["POST"])
@login_required
def api_agregar_producto():
    if current_user.role not in ["gerente", "encargado"]:
        return jsonify({"error": "No autorizado"}), 403

    data = request.get_json()
    nuevo = Producto(
        nombre=data["nombre"],
        categoria=data.get("categoria", ""),
        precio=data["precio"]
    )
    db.session.add(nuevo)
    db.session.commit()
    return jsonify({"message": "Producto agregado", "id": nuevo.id}), 201

@app.route("/api/menu/<int:producto_id>", methods=["PUT", "DELETE"])
@login_required
def api_editar_eliminar_producto(producto_id):
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": "Producto no encontrado"}), 404

    if request.method == "PUT":
        data = request.get_json()
        producto.nombre = data.get("nombre", producto.nombre)
        producto.categoria = data.get("categoria", producto.categoria)
        producto.precio = data.get("precio", producto.precio)
        db.session.commit()
        return jsonify({"message": "Producto actualizado"})

    if request.method == "DELETE":
        db.session.delete(producto)
        db.session.commit()
        return jsonify({"message": "Producto eliminado"})

# --- MESAS ---
@app.route("/api/mesas", methods=["GET"])
@login_required
def api_mesas():
    mesas = Mesa.query.order_by(Mesa.numero).all()
    return jsonify([{
        "id": m.id, 
        "numero": m.numero, 
        "estado": m.estado,
        "reserva": {
            "cliente": m.cliente_reserva,
            "personas": m.personas_reserva,
            "fecha_hora": m.fecha_hora_reserva.strftime('%Y-%m-%d %H:%M') if m.fecha_hora_reserva else None
        } if m.estado == 'Reservada' else None
    } for m in mesas])

@app.route("/api/mesas/<int:id>", methods=["PUT"])
@login_required
def api_actualizar_mesa(id):
    mesa = db.session.get(Mesa, id)
    if not mesa:
        return jsonify({"error": "Mesa no encontrada"}), 404
        
    data = request.json
    nuevo_estado = data.get("estado")
    
    if nuevo_estado not in ["Libre", "Ocupada", "Reservada"]:
        return jsonify({"error": "Estado no válido"}), 400

    mesa.estado = nuevo_estado
    
    if nuevo_estado == "Reservada":
        try:
            fecha_str = data.get("fecha")
            hora_str = data.get("hora")
            mesa.fecha_hora_reserva = datetime.strptime(f"{fecha_str} {hora_str}", '%Y-%m-%d %H:%M')
            mesa.cliente_reserva = data.get("cliente")
            mesa.personas_reserva = data.get("personas")
        except (ValueError, TypeError):
            return jsonify({"error": "Formato de fecha u hora inválido"}), 400
    else:
        mesa.cliente_reserva = None
        mesa.personas_reserva = None
        mesa.fecha_hora_reserva = None
        
    db.session.commit()
    return jsonify({"message": "Mesa actualizada"}), 200

# crear y eliminar mesas
@app.route("/api/mesas", methods=["POST"])
@login_required
def api_agregar_mesa():
    if current_user.role != "gerente":
        return jsonify({"error": "Solo el gerente puede agregar mesas"}), 403

    data = request.get_json()
    nueva = Mesa(numero=data["numero"], estado="Libre")
    db.session.add(nueva)
    db.session.commit()
    return jsonify({"message": "Mesa agregada", "id": nueva.id}), 201

@app.route("/api/mesas/<int:id>", methods=["DELETE"])
@login_required
def api_eliminar_mesa(id):
    if current_user.role != "gerente":
        return jsonify({"error": "Solo el gerente puede eliminar mesas"}), 403

    mesa = db.session.get(Mesa, id)
    if not mesa:
        return jsonify({"error": "Mesa no encontrada"}), 404

    db.session.delete(mesa)
    db.session.commit()
    return jsonify({"message": "Mesa eliminada"})

# --- PEDIDOS ---
@app.route("/api/pedidos", methods=["GET", "POST"])
@login_required
def api_pedidos():
    if request.method == "GET":
        pedidos = Pedido.query.order_by(Pedido.fecha.desc()).all()
        return jsonify([{
            "id": p.id,
            "cliente": p.cliente,
            "total": p.total,
            "fecha": p.fecha.isoformat(),
            "descripcion": p.descripcion, 
            "mesa": p.mesa 
        } for p in pedidos])

    if request.method == "POST":
        data = request.get_json()
        if not data or "items" not in data or not data["items"]:
            return jsonify({"error": "Se requieren items para crear un pedido"}), 400

        cliente_nombre = data.get("cliente")
        if not cliente_nombre or cliente_nombre.strip() == "":
            cliente_nombre = "Consumidor Final"

        mesa = data.get("mesa") or None   
        try:
            nuevo_pedido = Pedido(
                cliente=cliente_nombre,
                total=0,
                descripcion="",
                mesa=mesa 
            )
            db.session.add(nuevo_pedido)
            db.session.flush() 

            total_calculado = 0
            descripcion_items = []

            for item_data in data["items"]:
                producto = db.session.get(Producto, item_data["id"])
                if not producto:
                    db.session.rollback()
                    return jsonify({"error": f"Producto con ID {item_data['id']} no encontrado."}), 404

                cantidad = item_data.get("cantidad", 1)
                total_calculado += producto.precio * cantidad
                descripcion_items.append(f"{producto.nombre} x{cantidad}")

                pedido_item = PedidoItem(
                    pedido_id=nuevo_pedido.id,
                    producto_id=producto.id,
                    cantidad=cantidad
                )
                db.session.add(pedido_item)

            nuevo_pedido.total = total_calculado
            nuevo_pedido.descripcion = ", ".join(descripcion_items)

            db.session.commit()
            return jsonify({"id": nuevo_pedido.id, "message": "Pedido creado con éxito"}), 201

        except Exception as e:
            db.session.rollback() 
            return jsonify({"error": str(e)}), 500


@app.route("/api/pedidos/<int:pedido_id>", methods=["DELETE"])
@login_required
def api_eliminar_pedido(pedido_id):
    pedido = db.session.get(Pedido, pedido_id)
    if not pedido:
        return jsonify({"error": "Pedido no encontrado"}), 404
    
    try:
        db.session.delete(pedido)
        db.session.commit()
        return jsonify({"message": f"Pedido {pedido_id} eliminado con éxito."}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# actualizar pedido
@app.route("/api/pedidos/<int:pedido_id>", methods=["PUT"])
@login_required
def api_actualizar_pedido(pedido_id):
    pedido = db.session.get(Pedido, pedido_id)
    if not pedido:
        return jsonify({"error": "Pedido no encontrado"}), 404

    data = request.get_json()
    pedido.descripcion = data.get("descripcion", pedido.descripcion)
    pedido.total = data.get("total", pedido.total)
    db.session.commit()
    return jsonify({"message": "Pedido actualizado"})

# --- FACTURACIÓN ---
@app.route("/api/facturas", methods=["GET"])
@login_required
def api_facturas():
    facturas = Factura.query.order_by(Factura.fecha.desc()).all()
    return jsonify([{
        "id": f.id,
        "pedido_id": f.pedido_id,
        "total": f.total,
        "metodo_pago": f.metodo_pago,
        "fecha": f.fecha.isoformat(),
        "cliente": f.pedido.cliente if f.pedido else "N/A",
        "descripcion": f.pedido.descripcion if f.pedido else "N/A"
    } for f in facturas])

@app.route("/api/facturas", methods=["POST"])
@login_required
def api_crear_factura():
    data = request.get_json()
    pedido_id = data.get("pedido_id")
    metodo_pago = data.get("metodo_pago", "Efectivo")
    
    if not pedido_id:
        return jsonify({"error": "ID de pedido requerido"}), 400
    
    pedido = db.session.get(Pedido, pedido_id)
    if not pedido:
        return jsonify({"error": "Pedido no encontrado"}), 404
    
    try:
        # Usar una transacción para evitar condiciones de carrera
        with db.session.begin_nested():
            # Verificar si ya existe una factura para este pedido (con lock)
            factura_existente = Factura.query.filter_by(pedido_id=pedido_id).with_for_update().first()
            if factura_existente:
                return jsonify({"error": "Ya existe una factura para este pedido"}), 400
            
            nueva_factura = Factura(
                pedido_id=pedido_id,
                total=pedido.total,
                metodo_pago=metodo_pago
            )
            
            db.session.add(nueva_factura)
            db.session.flush()  # Flush para obtener el ID sin commit
            
            return jsonify({
                "id": nueva_factura.id,
                "message": "Factura creada exitosamente"
            }), 201
            
    except Exception as e:
        db.session.rollback()
        # Si es un error de integridad (duplicado), devolver mensaje específico
        if "UNIQUE constraint failed" in str(e) or "duplicate key" in str(e).lower():
            return jsonify({"error": "Ya existe una factura para este pedido"}), 400
        return jsonify({"error": f"Error al crear factura: {str(e)}"}), 500

@app.route("/api/facturas/<int:factura_id>", methods=["GET"])
@login_required
def api_obtener_factura(factura_id):
    factura = db.session.get(Factura, factura_id)
    if not factura:
        return jsonify({"error": "Factura no encontrada"}), 404
    
    # Obtener detalles del pedido y agrupar productos iguales
    pedido = factura.pedido
    items = []
    productos_agrupados = {}
    
    if pedido:
        # Agrupar productos por nombre
        for item in pedido.items:
            nombre_producto = item.producto.nombre
            if nombre_producto in productos_agrupados:
                productos_agrupados[nombre_producto]["cantidad"] += item.cantidad
                productos_agrupados[nombre_producto]["subtotal"] += item.producto.precio * item.cantidad
            else:
                productos_agrupados[nombre_producto] = {
                    "producto": nombre_producto,
                    "cantidad": item.cantidad,
                    "precio_unitario": item.producto.precio,
                    "subtotal": item.producto.precio * item.cantidad
                }
        
        # Convertir a lista
        items = list(productos_agrupados.values())
    
    # Calcular subtotal e IVA
    subtotal = sum(item["subtotal"] for item in items)
    iva_rate = 0.16  # 16% IVA
    iva_amount = subtotal * iva_rate
    total_con_iva = subtotal + iva_amount
    
    return jsonify({
        "id": factura.id,
        "pedido_id": factura.pedido_id,
        "total": factura.total,
        "subtotal": subtotal,
        "iva_rate": iva_rate,
        "iva_amount": iva_amount,
        "total_con_iva": total_con_iva,
        "metodo_pago": factura.metodo_pago,
        "fecha": factura.fecha.isoformat(),
        "cliente": pedido.cliente if pedido else "N/A",
        "mesa": pedido.mesa if pedido else None,
        "items": items,
        "descripcion": pedido.descripcion if pedido else "N/A"
    })

@app.route("/api/facturas/<int:factura_id>/enviar", methods=["POST"])
@login_required
def api_enviar_factura(factura_id):
    data = request.get_json()
    email = data.get("email")
    
    if not email:
        return jsonify({"error": "Email requerido"}), 400
    
    factura = db.session.get(Factura, factura_id)
    if not factura:
        return jsonify({"error": "Factura no encontrada"}), 404
    
    # Aquí se implementaría el envío real del email
    # Por ahora solo simulamos el envío
    return jsonify({
        "message": f"Factura enviada exitosamente a {email}",
        "success": True
    })

# --- LOGIN CLIENTE ---
@app.route("/api/login_cliente", methods=["POST"])
def api_login_cliente():
    # Buscar usuario genérico de cliente
    user = User.query.filter_by(username="cliente").first()

    if not user:
        return jsonify({
            "success": False,
            "message": "Usuario cliente no existe"
        }), 404

    # Inicia sesión automáticamente
    login_user(user)

    # Respuesta al frontend con redirect
    return jsonify({
        "success": True,
        "redirect": url_for("dashboard_cliente")
    })

# --- INIT DB ---
def init_db():
    with app.app_context():
        db.create_all()
        
        if User.query.filter_by(username="gerente").first() is None:
            user_gerente = User(username="gerente", role="gerente")
            user_gerente.set_password("1234")
            db.session.add(user_gerente)
            print("Usuario 'gerente' creado correctamente.")

        if User.query.filter_by(username="encargado").first() is None:
            user_encargado = User(username="encargado", role="encargado")
            user_encargado.set_password("1234")
            db.session.add(user_encargado)
            print("Usuario 'encargado' creado correctamente.")

        if User.query.filter_by(username="cliente").first() is None:
            cliente = User(username="cliente", role="cliente")
            cliente.set_password('')
            db.session.add(cliente)
            print("Usuario 'cliente' creado correctamente.")

        if Producto.query.count() == 0:
            productos = [
            ("Café Latte", "Bebidas", 2.5,"cafe.png"),
            ("Tostada con aguacate", "Comidas", 3.5, "tostada.png"),
            ("Brownie de chocolate", "Postres", 2.8, "brownie.png"),
            ("Jugo de Naranja", "Bebidas", 2.0, "jugo.png")
            ]
            for n, c, pr, img in productos:
                db.session.add(Producto(nombre=n, categoria=c, precio=pr, imagen_url=img))
        if Mesa.query.count() == 0:
            for n in range(1, 6):
                db.session.add(Mesa(numero=n, estado="Libre"))
        db.session.commit()
        print("Base de datos inicializada con éxito.")

if __name__ == "__main__":
    init_db()
    app.run(debug=True)

