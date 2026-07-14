from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import sys
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, 
            template_folder='templates',
            static_folder='static')
CORS(app)

# Configuración de PostgreSQL desde variables de entorno
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL no está configurada")
    print("📝 Configura la variable de entorno en Render")
    print("💡 Asegúrate de usar la External Database URL si la base de datos está en otra cuenta")
    sys.exit(1)

def get_db_connection():
    """Obtiene una conexión a PostgreSQL con manejo de errores y soporte SSL"""
    try:
        # Intentar conectar con SSL (requerido para conexiones externas)
        conn = psycopg2.connect(
            DATABASE_URL,
            sslmode='require',
            connect_timeout=30,
            keepalives=1,
            keepalives_idle=5,
            keepalives_interval=2,
            keepalives_count=2
        )
        print("✅ Conexión a PostgreSQL establecida (SSL activado)")
        return conn
    except Exception as e:
        print(f"❌ Error conectando a PostgreSQL con SSL: {e}")
        try:
            # Intentar sin SSL (por si acaso)
            print("⚠️ Intentando conexión sin SSL...")
            conn = psycopg2.connect(
                DATABASE_URL,
                connect_timeout=30
            )
            print("✅ Conexión a PostgreSQL establecida (sin SSL)")
            return conn
        except Exception as e2:
            print(f"❌ Error conectando a PostgreSQL: {e2}")
            return None

def init_db():
    """Crea la tabla si no existe con manejo de errores detallado"""
    try:
        conn = get_db_connection()
        if not conn:
            print("❌ No se pudo obtener conexión a la base de datos")
            return False
        
        cur = conn.cursor()
        
        # Verificar si la tabla existe
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'actividades'
            );
        """)
        table_exists = cur.fetchone()[0]
        
        if not table_exists:
            print("📝 Creando tabla 'actividades'...")
            cur.execute('''
                CREATE TABLE actividades (
                    id SERIAL PRIMARY KEY,
                    fecha DATE NOT NULL,
                    titulo VARCHAR(255) NOT NULL,
                    descripcion TEXT,
                    solucion TEXT,
                    direccion TEXT,
                    hora TIME,
                    cumplida BOOLEAN DEFAULT FALSE,
                    sin_actividades BOOLEAN DEFAULT FALSE,
                    orden INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Crear índices para mejorar rendimiento
            cur.execute('CREATE INDEX idx_actividades_fecha ON actividades(fecha)')
            cur.execute('CREATE INDEX idx_actividades_cumplida ON actividades(cumplida)')
            
            conn.commit()
            print("✅ Tabla 'actividades' creada exitosamente con índices")
        else:
            print("✅ Tabla 'actividades' ya existe")
            
            # Verificar si faltan columnas
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'actividades' 
                AND column_name = 'solucion'
            """)
            if not cur.fetchone():
                print("📝 Agregando columna 'solucion'...")
                cur.execute('ALTER TABLE actividades ADD COLUMN solucion TEXT')
                conn.commit()
                print("✅ Columna 'solucion' agregada")
            
            # Verificar columna 'sin_actividades'
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'actividades' 
                AND column_name = 'sin_actividades'
            """)
            if not cur.fetchone():
                print("📝 Agregando columna 'sin_actividades'...")
                cur.execute('ALTER TABLE actividades ADD COLUMN sin_actividades BOOLEAN DEFAULT FALSE')
                conn.commit()
                print("✅ Columna 'sin_actividades' agregada")
            else:
                # Verificar el tipo de la columna
                cur.execute("""
                    SELECT data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'actividades' 
                    AND column_name = 'sin_actividades'
                """)
                data_type = cur.fetchone()[0]
                print(f"📊 Columna 'sin_actividades' existe, tipo: {data_type}")
        
        cur.close()
        conn.close()
        return True
        
    except psycopg2.Error as e:
        print(f"❌ Error en PostgreSQL: {e}")
        return False
    except Exception as e:
        print(f"❌ Error al inicializar la base de datos: {e}")
        return False


@app.route('/')
def index():
    """Página principal"""
    try:
        return render_template('index.html')
    except Exception as e:
        return f"Error al cargar la página: {e}", 500

@app.route('/api/actividades', methods=['GET'])
def get_actividades():
    """Obtiene actividades con filtros opcionales"""
    fecha = request.args.get('fecha')
    mes = request.args.get('mes')
    año = request.args.get('año')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        if fecha:
            # Actividades de un día específico (ordenadas por hora)
            cur.execute('''
                SELECT * FROM actividades 
                WHERE fecha = %s 
                ORDER BY 
                    CASE WHEN hora IS NULL THEN 1 ELSE 0 END,
                    hora, 
                    orden, 
                    id
            ''', (fecha,))
        elif mes and año:
            # Actividades de un mes completo
            cur.execute('''
                SELECT * FROM actividades 
                WHERE EXTRACT(MONTH FROM fecha) = %s AND EXTRACT(YEAR FROM fecha) = %s
                ORDER BY fecha, 
                    CASE WHEN hora IS NULL THEN 1 ELSE 0 END,
                    hora, 
                    orden, 
                    id
            ''', (int(mes), int(año)))
        else:
            # Todas las actividades
            cur.execute('''
                SELECT * FROM actividades 
                ORDER BY fecha, 
                    CASE WHEN hora IS NULL THEN 1 ELSE 0 END,
                    hora, 
                    orden, 
                    id
            ''')
        
        actividades = cur.fetchall()
        
        # Convertir a formato JSON
        resultado = []
        for act in actividades:
            resultado.append({
                'id': act['id'],
                'fecha': act['fecha'].isoformat() if act['fecha'] else None,
                'titulo': act['titulo'],
                'descripcion': act['descripcion'] or '',
                'solucion': act['solucion'] or '',
                'direccion': act['direccion'] or '',
                'hora': act['hora'].strftime('%H:%M') if act['hora'] else '',
                'cumplida': act['cumplida'],
                'sin_actividades': act['sin_actividades'] or False,
                'orden': act['orden'],
                'created_at': act['created_at'].isoformat() if act['created_at'] else None
            })
        
        return jsonify(resultado)
    
    except psycopg2.Error as e:
        print(f"❌ Error en get_actividades (PostgreSQL): {e}")
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    except Exception as e:
        print(f"❌ Error en get_actividades: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/actividades', methods=['POST'])
def crear_actividad():
    """Crea una nueva actividad"""
    try:
        data = request.json
        print("📝 Datos recibidos en POST:", data)
        
        fecha = data.get('fecha')
        titulo = data.get('titulo')
        descripcion = data.get('descripcion', '')
        solucion = data.get('solucion', '')
        direccion = data.get('direccion', '')
        hora = data.get('hora') or None
        sin_actividades = data.get('sin_actividades', False)
        
        print(f"📊 sin_actividades: {sin_actividades}, tipo: {type(sin_actividades)}")
        
        if not fecha or not titulo:
            return jsonify({'error': 'Fecha y título son obligatorios'}), 400
        
        # Validar formato de fecha
        try:
            from datetime import datetime
            datetime.strptime(fecha, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Formato de fecha inválido. Use YYYY-MM-DD'}), 400
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Error de conexión a la base de datos'}), 500
        
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            # Obtener el máximo orden
            cur.execute('SELECT COALESCE(MAX(orden), -1) + 1 as nuevo_orden FROM actividades WHERE fecha = %s', (fecha,))
            resultado = cur.fetchone()
            nuevo_orden = resultado['nuevo_orden'] if resultado else 0
            
            print("📝 Insertando actividad en la base de datos...")
            print(f"📝 Datos a insertar: fecha={fecha}, titulo={titulo}, sin_actividades={sin_actividades}")
            
            # Asegurarse de que sin_actividades sea booleano
            sin_actividades_bool = bool(sin_actividades)
            
            cur.execute('''
                INSERT INTO actividades (fecha, titulo, descripcion, solucion, direccion, hora, sin_actividades, orden)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            ''', (fecha, titulo, descripcion, solucion, direccion, hora, sin_actividades_bool, nuevo_orden))
            
            nueva_actividad = cur.fetchone()
            conn.commit()
            
            print("✅ Actividad creada exitosamente:", nueva_actividad['id'])
            
            # Convertir a JSON
            return jsonify({
                'id': nueva_actividad['id'],
                'fecha': nueva_actividad['fecha'].isoformat(),
                'titulo': nueva_actividad['titulo'],
                'descripcion': nueva_actividad['descripcion'] or '',
                'solucion': nueva_actividad['solucion'] or '',
                'direccion': nueva_actividad['direccion'] or '',
                'hora': nueva_actividad['hora'].strftime('%H:%M') if nueva_actividad['hora'] else '',
                'cumplida': nueva_actividad['cumplida'],
                'sin_actividades': nueva_actividad['sin_actividades'] or False,
                'orden': nueva_actividad['orden'],
                'created_at': nueva_actividad['created_at'].isoformat() if nueva_actividad['created_at'] else None
            }), 201
        
        except psycopg2.Error as e:
            conn.rollback()
            print(f"❌ Error en PostgreSQL: {e}")
            print(f"❌ Código de error: {e.pgcode if hasattr(e, 'pgcode') else 'Desconocido'}")
            print(f"❌ Detalle: {e.diag.message_primary if hasattr(e, 'diag') else 'Sin detalle'}")
            return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
        except Exception as e:
            conn.rollback()
            print(f"❌ Error inesperado: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
        finally:
            cur.close()
            conn.close()
            
    except Exception as e:
        print(f"❌ Error en la solicitud: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/actividades/<int:id>', methods=['PUT'])
def actualizar_actividad(id):
    """Actualiza una actividad existente"""
    data = request.json
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        # Verificar existencia
        cur.execute('SELECT * FROM actividades WHERE id = %s', (id,))
        if not cur.fetchone():
            return jsonify({'error': 'Actividad no encontrada'}), 404
        
        # Construir consulta dinámica
        updates = []
        params = []
        
        if 'cumplida' in data:
            updates.append('cumplida = %s')
            params.append(data['cumplida'])
        
        if 'fecha' in data and data['fecha']:
            updates.append('fecha = %s')
            params.append(data['fecha'])
        
        if 'titulo' in data and data['titulo']:
            updates.append('titulo = %s')
            params.append(data['titulo'])
        
        if 'descripcion' in data:
            updates.append('descripcion = %s')
            params.append(data['descripcion'])
        
        if 'solucion' in data:
            updates.append('solucion = %s')
            params.append(data['solucion'])
        
        if 'direccion' in data:
            updates.append('direccion = %s')
            params.append(data['direccion'])
        
        if 'hora' in data:
            # Permitir null para hora
            hora_val = data['hora'] if data['hora'] else None
            updates.append('hora = %s')
            params.append(hora_val)
        
        if 'sin_actividades' in data:
            updates.append('sin_actividades = %s')
            params.append(data['sin_actividades'])
        
        if not updates:
            return jsonify({'error': 'No se proporcionaron campos para actualizar'}), 400
        
        params.append(id)
        query = f"UPDATE actividades SET {', '.join(updates)} WHERE id = %s RETURNING *"
        cur.execute(query, params)
        
        actividad = cur.fetchone()
        conn.commit()
        
        return jsonify({
            'id': actividad['id'],
            'fecha': actividad['fecha'].isoformat(),
            'titulo': actividad['titulo'],
            'descripcion': actividad['descripcion'] or '',
            'solucion': actividad['solucion'] or '',
            'direccion': actividad['direccion'] or '',
            'hora': actividad['hora'].strftime('%H:%M') if actividad['hora'] else '',
            'cumplida': actividad['cumplida'],
            'sin_actividades': actividad['sin_actividades'] or False,
            'orden': actividad['orden'],
            'created_at': actividad['created_at'].isoformat() if actividad['created_at'] else None
        })
    
    except psycopg2.Error as e:
        conn.rollback()
        print(f"❌ Error en actualizar_actividad (PostgreSQL): {e}")
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en actualizar_actividad: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/actividades/<int:id>', methods=['DELETE'])
def eliminar_actividad(id):
    """Elimina una actividad"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    cur = conn.cursor()
    
    try:
        cur.execute('DELETE FROM actividades WHERE id = %s', (id,))
        
        if cur.rowcount == 0:
            return jsonify({'error': 'Actividad no encontrada'}), 404
        
        conn.commit()
        return jsonify({'message': 'Actividad eliminada correctamente'}), 200
    
    except psycopg2.Error as e:
        conn.rollback()
        print(f"❌ Error en eliminar_actividad (PostgreSQL): {e}")
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en eliminar_actividad: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/actividades/reordenar', methods=['POST'])
def reordenar_actividades():
    """Actualiza el orden de las actividades"""
    data = request.json
    actividades = data.get('actividades', [])
    
    if not actividades:
        return jsonify({'error': 'No se proporcionaron actividades'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    cur = conn.cursor()
    
    try:
        for idx, act in enumerate(actividades):
            cur.execute(
                'UPDATE actividades SET orden = %s WHERE id = %s',
                (idx, act['id'])
            )
        
        conn.commit()
        return jsonify({'message': 'Orden actualizado correctamente'}), 200
    
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en reordenar_actividades: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/estadisticas', methods=['GET'])
def get_estadisticas():
    """Obtiene estadísticas generales"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        # Total de actividades (excluyendo las de "sin_actividades")
        cur.execute('SELECT COUNT(*) as total FROM actividades WHERE sin_actividades = false')
        total = cur.fetchone()['total']
        
        # Actividades cumplidas
        cur.execute('SELECT COUNT(*) as cumplidas FROM actividades WHERE cumplida = true AND sin_actividades = false')
        cumplidas = cur.fetchone()['cumplidas']
        
        # Actividades por día (últimos 7 días)
        cur.execute('''
            SELECT fecha, COUNT(*) as count 
            FROM actividades 
            WHERE fecha >= CURRENT_DATE - INTERVAL '7 days' AND sin_actividades = false
            GROUP BY fecha 
            ORDER BY fecha
        ''')
        ultimos_dias = cur.fetchall()
        
        return jsonify({
            'total': total,
            'cumplidas': cumplidas,
            'pendientes': total - cumplidas,
            'ultimos_dias': [{'fecha': row['fecha'].isoformat(), 'count': row['count']} for row in ultimos_dias]
        })
    
    except Exception as e:
        print(f"❌ Error en get_estadisticas: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Recurso no encontrado'}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Error interno del servidor'}), 500

# Inicializar la base de datos al arrancar
if __name__ == '__main__':
    print("🚀 Iniciando servidor...")
    print(f"🐍 Python version: {sys.version}")
    print(f"📊 DATABASE_URL: {DATABASE_URL[:50]}..." if DATABASE_URL else "❌ DATABASE_URL no definida")
    
    # Inicializar base de datos
    if init_db():
        print("✅ Base de datos lista para usar")
    else:
        print("⚠️ Error al inicializar la base de datos")
        print("💡 Verifica que:")
        print("   - La External Database URL sea correcta")
        print("   - El usuario tenga permisos para crear tablas")
        print("   - La base de datos exista")
    
    port = int(os.getenv('PORT', 5000))
    print(f"🌐 Servidor corriendo en http://0.0.0.0:{port}")
    print("📋 Presiona Ctrl+C para detener el servidor")
    app.run(debug=False, host='0.0.0.0', port=port)
