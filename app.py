from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
from flask_mail import Mail, Message 
import os
import pytz
app = Flask(__name__)
app.config['SECRET_KEY'] = "una_clave_secreta_muy_segura"
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cafeteria.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- CONFIGURACIÓN DE FLASK-MAIL ---
# (Es recomendable usar variables de entorno para la seguridad)
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
# ¡IMPORTANTE! Usa variables de entorno en producción
app.config['MAIL_USERNAME'] = os.environ.get('EMAIL_USER') # Ej: 'tu_correo@gmail.com'
app.config['MAIL_PASSWORD'] = os.environ.get('EMAIL_PASS') # Ej: 'tu_contraseña_de_aplicacion'
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('EMAIL_USER')

mail = Mail(app) # <-- Inicializa Flask-Mail con tu app

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login_page"

# Configuración para la carpeta donde se guardarán las imágenes
UPLOAD_FOLDER = os.path.join('static', 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Función auxiliar para verificar que la extensión del archivo sea válida
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg', 'webp'}

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
    descripcion = db.Column(db.String(250), nullable=True)
    imagen_url = db.Column(db.String(100), nullable=True, default='default.png')
    imagen_qr = db.Column(db.String(200), nullable=True) # Campo para la ruta, ej: 'images/qr/qr-latte.png'
    


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

@app.route('/menu-ra')
def ra_page():
    # 1. Consulta la base de datos para obtener todos los productos
    todos_los_productos = Producto.query.all()
    
    # 2. Pasa la lista de productos a la plantilla al renderizarla
    return render_template('RA.html', productos=todos_los_productos)

# --- ESTADÍSTICAS ---
@app.route("/api/estadisticas", methods=["GET"])
@login_required
def api_estadisticas():
    """
    Endpoint para obtener un resumen de las estadísticas de la cafetería.
    """
    if current_user.role not in ["gerente", "encargado"]:
        return jsonify({"error": "Acceso no autorizado"}), 403

    # 1. Ingresos totales (sumando todas las facturas)
    total_ingresos = db.session.query(func.sum(Factura.total)).scalar() or 0.0

    # 2. Número total de pedidos registrados
    total_pedidos = Pedido.query.count()

    # 3. Productos más vendidos (Top 5)
    productos_mas_vendidos_query = db.session.query(
        Producto.nombre,
        func.sum(PedidoItem.cantidad).label('total_vendido')
    ).join(
        Producto, PedidoItem.producto_id == Producto.id
    ).group_by(
        Producto.nombre
    ).order_by(
        func.sum(PedidoItem.cantidad).desc()
    ).limit(5).all()

    # Formatear el resultado para el JSON
    productos_mas_vendidos = [
        {"nombre": nombre, "cantidad": total_vendido}
        for nombre, total_vendido in productos_mas_vendidos_query
    ]

    # 4. Datos para el gráfico: Ingresos de los últimos 7 días
    hace_7_dias = datetime.utcnow().date() - timedelta(days=6)
    
    ingresos_diarios = db.session.query(
        func.date(Factura.fecha).label('dia'),
        func.sum(Factura.total).label('ingresos_del_dia')
    ).filter(
        func.date(Factura.fecha) >= hace_7_dias
    ).group_by('dia').all()

    # Crear un mapa para facilitar la búsqueda de ingresos por día
    ingresos_map = {str(dia): ingresos for dia, ingresos in ingresos_diarios}
    
    labels_grafico = []
    data_grafico = []

    # Generar las etiquetas y datos para los 7 días, poniendo 0 si no hubo ventas
    for i in range(7):
        fecha_actual = hace_7_dias + timedelta(days=i)
        fecha_str = fecha_actual.strftime('%Y-%m-%d')
        labels_grafico.append(fecha_actual.strftime('%d/%m')) # Formato amigable para el gráfico
        data_grafico.append(ingresos_map.get(fecha_str, 0))

    # Construir la respuesta final
    return jsonify({
        "total_ingresos": round(total_ingresos, 2),
        "total_pedidos": total_pedidos,
        "productos_mas_vendidos": productos_mas_vendidos,
        "grafico_ventas_semanales": {
            "labels": labels_grafico,
            "data": data_grafico
        }
    })

# --- REPORTES ---
@app.route("/api/reportes/diarios", methods=["GET"])
@login_required
def api_reportes_diarios():
    """
    Endpoint para obtener estadísticas diarias de ventas.
    """
    if current_user.role not in ["gerente", "encargado"]:
        return jsonify({"error": "Acceso no autorizado"}), 403

    hoy = datetime.utcnow().date()
    
    # Pedidos del día
    pedidos_hoy = Pedido.query.filter(func.date(Pedido.fecha) == hoy).count()
    
    # Ingresos del día
    ingresos_hoy = db.session.query(func.sum(Factura.total)).join(
        Pedido, Factura.pedido_id == Pedido.id
    ).filter(func.date(Pedido.fecha) == hoy).scalar() or 0.0
    
    return jsonify({
        "fecha": hoy.strftime('%Y-%m-%d'),
        "pedidos_hoy": pedidos_hoy,
        "ingresos_hoy": round(ingresos_hoy, 2)
    })

@app.route("/api/reportes/mensuales", methods=["GET"])
@login_required
def api_reportes_mensuales():
    """
    Endpoint para obtener estadísticas mensuales de ventas.
    """
    if current_user.role not in ["gerente", "encargado"]:
        return jsonify({"error": "Acceso no autorizado"}), 403

    hoy = datetime.utcnow()
    mes_actual = hoy.month
    año_actual = hoy.year
    
    # Pedidos del mes
    pedidos_mes = Pedido.query.filter(
        func.extract('month', Pedido.fecha) == mes_actual,
        func.extract('year', Pedido.fecha) == año_actual
    ).count()
    
    # Ingresos del mes
    ingresos_mes = db.session.query(func.sum(Factura.total)).join(
        Pedido, Factura.pedido_id == Pedido.id
    ).filter(
        func.extract('month', Pedido.fecha) == mes_actual,
        func.extract('year', Pedido.fecha) == año_actual
    ).scalar() or 0.0
    
    return jsonify({
        "mes": mes_actual,
        "año": año_actual,
        "pedidos_mes": pedidos_mes,
        "ingresos_mes": round(ingresos_mes, 2)
    })

@app.route("/api/reportes/factura-diaria", methods=["GET"])
@login_required
def api_factura_diaria():
    """
    Endpoint para generar factura diaria con detalles de ventas.
    """
    if current_user.role not in ["gerente", "encargado"]:
        return jsonify({"error": "Acceso no autorizado"}), 403

    hoy = datetime.utcnow().date()
    
    # Obtener todas las facturas del día
    facturas_dia = db.session.query(Factura).join(
        Pedido, Factura.pedido_id == Pedido.id
    ).filter(func.date(Pedido.fecha) == hoy).all()
    
    # Calcular totales
    total_ingresos = sum(f.total for f in facturas_dia)
    total_pedidos = len(facturas_dia)
    
    # Productos más vendidos del día
    productos_dia = db.session.query(
        Producto.nombre,
        func.sum(PedidoItem.cantidad).label('cantidad_vendida'),
        func.sum(PedidoItem.cantidad * Producto.precio).label('ingresos_producto')
    ).join(
        PedidoItem, Producto.id == PedidoItem.producto_id
    ).join(
        Pedido, PedidoItem.pedido_id == Pedido.id
    ).filter(
        func.date(Pedido.fecha) == hoy
    ).group_by(Producto.nombre).order_by(
        func.sum(PedidoItem.cantidad).desc()
    ).all()
    
    productos_detalle = [
        {
            "nombre": nombre,
            "cantidad": cantidad_vendida,
            "ingresos": round(ingresos_producto, 2)
        }
        for nombre, cantidad_vendida, ingresos_producto in productos_dia
    ]
    
    return jsonify({
        "fecha": hoy.strftime('%d/%m/%Y'),
        "total_ingresos": round(total_ingresos, 2),
        "total_pedidos": total_pedidos,
        "productos_vendidos": productos_detalle,
        "facturas": [
            {
                "id": f.id,
                "cliente": f.pedido.cliente,
                "total": f.total,
                "metodo_pago": f.metodo_pago,
                "hora": f.fecha.strftime('%H:%M')
            }
            for f in facturas_dia
        ]
    })

@app.route("/api/reportes/reporte-mensual", methods=["GET"])
@login_required
def api_reporte_mensual():
    """
    Endpoint para generar reporte mensual con estadísticas detalladas.
    """
    if current_user.role not in ["gerente", "encargado"]:
        return jsonify({"error": "Acceso no autorizado"}), 403

    hoy = datetime.utcnow()
    mes_actual = hoy.month
    año_actual = hoy.year
    
    # Obtener todas las facturas del mes
    facturas_mes = db.session.query(Factura).join(
        Pedido, Factura.pedido_id == Pedido.id
    ).filter(
        func.extract('month', Pedido.fecha) == mes_actual,
        func.extract('year', Pedido.fecha) == año_actual
    ).all()
    
    # Calcular totales
    total_ingresos = sum(f.total for f in facturas_mes)
    total_pedidos = len(facturas_mes)
    
    # Productos más vendidos del mes
    productos_mes = db.session.query(
        Producto.nombre,
        func.sum(PedidoItem.cantidad).label('cantidad_vendida'),
        func.sum(PedidoItem.cantidad * Producto.precio).label('ingresos_producto')
    ).join(
        PedidoItem, Producto.id == PedidoItem.producto_id
    ).join(
        Pedido, PedidoItem.pedido_id == Pedido.id
    ).filter(
        func.extract('month', Pedido.fecha) == mes_actual,
        func.extract('year', Pedido.fecha) == año_actual
    ).group_by(Producto.nombre).order_by(
        func.sum(PedidoItem.cantidad).desc()
    ).all()
    
    productos_detalle = [
        {
            "nombre": nombre,
            "cantidad": cantidad_vendida,
            "ingresos": round(ingresos_producto, 2)
        }
        for nombre, cantidad_vendida, ingresos_producto in productos_mes
    ]
    
    # Días con mayores ventas del mes
    ventas_por_dia = db.session.query(
        func.date(Pedido.fecha).label('dia'),
        func.sum(Factura.total).label('ingresos_dia')
    ).join(
        Factura, Pedido.id == Factura.pedido_id
    ).filter(
        func.extract('month', Pedido.fecha) == mes_actual,
        func.extract('year', Pedido.fecha) == año_actual
    ).group_by(func.date(Pedido.fecha)).order_by(
        func.sum(Factura.total).desc()
    ).limit(5).all()
    
    mejores_dias = [
        {
            "fecha": dia.strftime('%d/%m/%Y') if hasattr(dia, 'strftime') else str(dia),
            "ingresos": round(ingresos_dia, 2)
        }
        for dia, ingresos_dia in ventas_por_dia
    ]
    
    # Métodos de pago más utilizados
    metodos_pago = db.session.query(
        Factura.metodo_pago,
        func.count(Factura.id).label('cantidad'),
        func.sum(Factura.total).label('total')
    ).filter(
        func.extract('month', Factura.fecha) == mes_actual,
        func.extract('year', Factura.fecha) == año_actual
    ).group_by(Factura.metodo_pago).all()
    
    metodos_detalle = [
        {
            "metodo": metodo,
            "cantidad": cantidad,
            "total": round(total, 2)
        }
        for metodo, cantidad, total in metodos_pago
    ]
    
    return jsonify({
        "mes": mes_actual,
        "año": año_actual,
        "total_ingresos": round(total_ingresos, 2),
        "total_pedidos": total_pedidos,
        "productos_mas_vendidos": productos_detalle,
        "mejores_dias": mejores_dias,
        "metodos_pago": metodos_detalle,
        "promedio_diario": round(total_ingresos / max(1, hoy.day), 2)
    })

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
    lista_productos = []

    for p in productos:
        imagen_final_url = ''

        # Si el producto tiene una imagen asignada en la base de datos...
        if p.imagen_url:
            # --- LÍNEA CORREGIDA ---
            # Usamos un f-string con '/' en lugar de os.path.join
            filename = f"uploads/{p.imagen_url}"
            imagen_final_url = url_for('static', filename=filename)
        else:
            # Si no, usamos una imagen por defecto de la carpeta 'images'
            imagen_final_url = url_for('static', filename='images/default.png')

        lista_productos.append({
            "id": p.id,
            "nombre": p.nombre,
            "categoria": p.categoria,
            "precio": p.precio,
            "descripcion": p.descripcion,
            "imagen_url": imagen_final_url
        })

    return jsonify(lista_productos)
# crear, editar, eliminar productos
@app.route("/api/menu", methods=["POST"])
@login_required
def api_agregar_producto():
    if current_user.role not in ["gerente", "encargado"]:
        return jsonify({"error": "No autorizado"}), 403

    # 1. Obtenemos los datos de texto desde request.form
    nombre = request.form.get('nombre')
    categoria = request.form.get('categoria', '')
    precio = request.form.get('precio')
    descripcion = request.form.get('descripcion', '') # Asumiendo que también lo envías

    # Validaciones básicas
    if not nombre or not precio:
        return jsonify({"error": "Nombre y precio son requeridos"}), 400

    # 2. Manejamos el archivo de la imagen
    imagen_filename = "default.png" # Usar una imagen por defecto
    if 'imagen' in request.files:
        file = request.files['imagen']
        # Si el usuario sube un archivo válido, lo procesamos
        if file and allowed_file(file.filename):
            imagen_filename = secure_filename(file.filename)
            file.path = os.path.join(app.config['UPLOAD_FOLDER'], imagen_filename)
            file.save(file.path)

    # 3. Creamos el producto con el nombre de la imagen
    nuevo = Producto(
        nombre=nombre,
        categoria=categoria,
        precio=float(precio),
        descripcion=descripcion,
        imagen_url=imagen_filename # Guardamos el nombre del archivo en la BD
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
        
        # --- LÍNEA QUE FALTA ---
        # Añade esta línea para guardar la descripción
        producto.descripcion = data.get("descripcion", producto.descripcion)
        
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
 

        # 1. Definimos las zonas horarias
        utc_tz = pytz.utc
        arg_tz = pytz.timezone('America/Argentina/Buenos_Aires')

        pedidos = Pedido.query.order_by(Pedido.fecha.desc()).all()

        # 2. Creamos la lista de pedidos para enviar
        lista_pedidos = []
        for p in pedidos:
            # Convertimos la fecha de UTC a la hora de Argentina
            fecha_argentina = p.fecha.replace(tzinfo=utc_tz).astimezone(arg_tz)

            lista_pedidos.append({
                "id": p.id,
                "cliente": p.cliente,
                "total": p.total,
                # Enviamos la fecha ya formateada y convertida
                "fecha": fecha_argentina.strftime('%d/%m/%Y, %H:%M'),
                "descripcion": p.descripcion, 
                "mesa": p.mesa 
            })

        return jsonify(lista_pedidos)

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
def _get_factura_data(factura_id):
    """Función auxiliar para obtener los datos de una factura como un diccionario."""
    factura = db.session.get(Factura, factura_id)
    if not factura:
        return None

    pedido = factura.pedido
    items_agrupados = {}
    
    if pedido:
        for item in pedido.items:
            nombre_producto = item.producto.nombre
            if nombre_producto in items_agrupados:
                items_agrupados[nombre_producto]["cantidad"] += item.cantidad
                items_agrupados[nombre_producto]["subtotal"] += item.producto.precio * item.cantidad
            else:
                items_agrupados[nombre_producto] = {
                    "producto": nombre_producto,
                    "cantidad": item.cantidad,
                    "precio_unitario": item.producto.precio,
                    "subtotal": item.producto.precio * item.cantidad
                }
    
    items_final = list(items_agrupados.values())

    subtotal = sum(item["subtotal"] for item in items_final)
    iva_rate = 0.16
    iva_amount = subtotal * iva_rate
    total_con_iva = subtotal + iva_amount
    
    return {
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
        "items": items_final
    }

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
    factura_data = _get_factura_data(factura_id)
    if not factura_data:
        return jsonify({"error": "Factura no encontrada"}), 404
    return jsonify(factura_data)

@app.route("/api/facturas/<int:factura_id>/enviar", methods=["POST"])
@login_required
def api_enviar_factura(factura_id):
    data = request.get_json()
    email_destino = data.get("email")
    
    if not email_destino:
        return jsonify({"error": "Email requerido"}), 400
    
    factura_data = _get_factura_data(factura_id)
    
    if not factura_data:
        return jsonify({"error": "Factura no encontrada"}), 404

    try:
        html_body = render_template('email_factura.html', factura=factura_data)
        
        msg = Message(
            subject=f"Factura #{factura_data['id']} de Café Terraza",
            recipients=[email_destino],
            html=html_body
        )
        
        mail.send(msg)
        
        return jsonify({
            "message": f"Factura enviada exitosamente a {email_destino}",
            "success": True
        })
        
    except Exception as e:
        print(f"ERROR DETALLADO AL ENVIAR EMAIL: {e}") 
        # El error que viste antes significa que 'factura_data' no es un diccionario.
        # Con esta nueva estructura, eso ya no debería pasar.
        return jsonify({"error": "Error interno del servidor al enviar el email."}), 500

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
        
        # ... (Creación de usuarios - sin cambios) ...
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
            
        # --- AQUÍ ESTÁ LA MODIFICACIÓN ---
        if Producto.query.count() == 0:
            productos = [
                # (nombre, categoria, precio, img_normal, descripcion, img_qr)
                ("Café Latte", "Bebidas", 2.5, "cafe.png", "Café espresso con leche vaporizada, suave y cremoso.", "images/qr/qr-latte.png"),
                ("Tostada con aguacate", "Comidas", 3.5, "tostada.png", "Tostadas integrales con aguacate fresco y especias.", "images/qr/qr-tostada.png"),
                ("Brownie de chocolate", "Postres", 2.8, "brownie.png", "Brownie casero de chocolate con nueces.", "images/qr/qr-brownie.png"),
                ("Jugo de Naranja", "Bebidas", 2.0, "jugo.png", "Jugo natural de naranja recién exprimido.", "images/qr/qr-jugo.png")
            ]

            # Actualiza el bucle para incluir 'img_qr'
            for n, c, pr, img, desc, img_qr in productos:
                db.session.add(Producto(
                    nombre=n, 
                    categoria=c, 
                    precio=pr, 
                    imagen_url=img, 
                    descripcion=desc,
                    imagen_qr=img_qr  # <-- Campo nuevo añadido
                ))
            print("Productos de ejemplo creados con sus QR.")
            
        if Mesa.query.count() == 0:
            for n in range(1, 6):
                db.session.add(Mesa(numero=n, estado="Libre"))
        
        db.session.commit()
        print("Base de datos inicializada con éxito.")

if __name__ == "__main__":
    init_db()
    app.run(debug=True)
