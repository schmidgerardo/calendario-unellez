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
    sys.exit(1)

def get_db_connection():
    """Obtiene una conexión a PostgreSQL"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"❌ Error conectando a PostgreSQL: {e}")
        return None

def init_db():
    """Crea la tabla si no existe"""
    try:
        conn = get_db_connection()
        if not conn:
            return
        
        cur = conn.cursor()
        
        # Crear tabla de actividades
        cur.execute('''
            CREATE TABLE IF NOT EXISTS actividades (
                id SERIAL PRIMARY KEY,
                fecha DATE NOT NULL,
                titulo VARCHAR(255) NOT NULL,
                descripcion TEXT,
                solucion TEXT,
                direccion TEXT,
                hora TIME,
                cumplida BOOLEAN DEFAULT FALSE,
                orden INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        cur.close()
        conn.close()
        print("✅ Base de datos PostgreSQL inicializada correctamente")
    except Exception as e:
        print(f"❌ Error al inicializar la base de datos: {e}")
        sys.exit(1)

@app.route('/')
def index():
    try:
        return render_template('index.html')
    except Exception as e:
        return f"Error al cargar la página: {e}", 500

@app.route('/api/actividades', methods=['GET'])
def get_actividades():
    fecha = request.args.get('fecha')
    mes = request.args.get('mes')
    año = request.args.get('año')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        if fecha:
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
            cur.execute('''
                SELECT * FROM actividades 
                ORDER BY fecha, 
                    CASE WHEN hora IS NULL THEN 1 ELSE 0 END,
                    hora, 
                    orden, 
                    id
            ''')
        
        actividades = cur.fetchall()
        
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
                'orden': act['orden'],
                'created_at': act['created_at'].isoformat() if act['created_at'] else None
            })
        
        return jsonify(resultado)
    
    except Exception as e:
        print(f"❌ Error en get_actividades: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/actividades', methods=['POST'])
def crear_actividad():
    data = request.json
    fecha = data.get('fecha')
    titulo = data.get('titulo')
    descripcion = data.get('descripcion', '')
    solucion = data.get('solucion', '')
    direccion = data.get('direccion', '')
    hora = data.get('hora', None)
    
    if not fecha or not titulo:
        return jsonify({'error': 'Fecha y título son obligatorios'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        cur.execute('SELECT COALESCE(MAX(orden), -1) + 1 as nuevo_orden FROM actividades WHERE fecha = %s', (fecha,))
        nuevo_orden = cur.fetchone()['nuevo_orden'] or 0
        
        cur.execute('''
            INSERT INTO actividades (fecha, titulo, descripcion, solucion, direccion, hora, orden)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        ''', (fecha, titulo, descripcion, solucion, direccion, hora, nuevo_orden))
        
        nueva_actividad = cur.fetchone()
        conn.commit()
        
        return jsonify({
            'id': nueva_actividad['id'],
            'fecha': nueva_actividad['fecha'].isoformat(),
            'titulo': nueva_actividad['titulo'],
            'descripcion': nueva_actividad['descripcion'] or '',
            'solucion': nueva_actividad['solucion'] or '',
            'direccion': nueva_actividad['direccion'] or '',
            'hora': nueva_actividad['hora'].strftime('%H:%M') if nueva_actividad['hora'] else '',
            'cumplida': nueva_actividad['cumplida'],
            'orden': nueva_actividad['orden'],
            'created_at': nueva_actividad['created_at'].isoformat() if nueva_actividad['created_at'] else None
        }), 201
    
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en crear_actividad: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/actividades/<int:id>', methods=['PUT'])
def actualizar_actividad(id):
    data = request.json
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        cur.execute('SELECT * FROM actividades WHERE id = %s', (id,))
        if not cur.fetchone():
            return jsonify({'error': 'Actividad no encontrada'}), 404
        
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
            updates.append('hora = %s')
            params.append(data['hora'] if data['hora'] else None)
        
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
            'orden': actividad['orden'],
            'created_at': actividad['created_at'].isoformat() if actividad['created_at'] else None
        })
    
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en actualizar_actividad: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

@app.route('/api/actividades/<int:id>', methods=['DELETE'])
def eliminar_actividad(id):
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
    
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en eliminar_actividad: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close()
        conn.close()

if __name__ == '__main__':
    print("🚀 Iniciando servidor...")
    print(f"🐍 Python version: {sys.version}")
    init_db()
    port = int(os.getenv('PORT', 5000))
    print(f"🌐 Servidor corriendo en http://0.0.0.0:{port}")
    app.run(debug=False, host='0.0.0.0', port=port)
