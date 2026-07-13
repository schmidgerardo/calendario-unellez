from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3
from datetime import datetime
import os
import sys

app = Flask(__name__, 
            template_folder='templates',
            static_folder='static')
CORS(app)

# Configuración de la base de datos SQLite
DATABASE = 'calendario.db'

def get_db_connection():
    """Obtiene una conexión a la base de datos SQLite"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Crea la tabla si no existe con todos los campos"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Crear tabla de actividades con todos los campos
        cur.execute('''
            CREATE TABLE IF NOT EXISTS actividades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha TEXT NOT NULL,
                titulo TEXT NOT NULL,
                descripcion TEXT,
                solucion TEXT,
                direccion TEXT,
                hora TEXT,
                cumplida INTEGER DEFAULT 0,
                orden INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        print("✅ Base de datos SQLite inicializada correctamente")
        print(f"📁 Archivo de base de datos: {os.path.abspath(DATABASE)}")
    except Exception as e:
        print(f"❌ Error al inicializar la base de datos: {e}")
        sys.exit(1)

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
    cur = conn.cursor()
    
    try:
        if fecha:
            # Actividades de un día específico (ordenadas por hora)
            cur.execute(
                '''SELECT * FROM actividades 
                   WHERE fecha = ? 
                   ORDER BY 
                       CASE WHEN hora IS NULL OR hora = '' THEN 1 ELSE 0 END,
                       hora, 
                       orden, 
                       id''',
                (fecha,)
            )
        elif mes and año:
            # Actividades de un mes completo - usando LIKE
            mes_padded = f"{int(mes):02d}"
            año_str = str(año)
            patron = f"{año_str}-{mes_padded}-%"
            cur.execute('''
                SELECT * FROM actividades 
                WHERE fecha LIKE ?
                ORDER BY fecha, 
                    CASE WHEN hora IS NULL OR hora = '' THEN 1 ELSE 0 END,
                    hora, 
                    orden, 
                    id
            ''', (patron,))
        else:
            # Todas las actividades
            cur.execute('''
                SELECT * FROM actividades 
                ORDER BY fecha, 
                    CASE WHEN hora IS NULL OR hora = '' THEN 1 ELSE 0 END,
                    hora, 
                    orden, 
                    id
            ''')
        
        actividades = cur.fetchall()
        
        # Convertir a lista de diccionarios
        resultado = []
        for act in actividades:
            resultado.append({
                'id': act['id'],
                'fecha': act['fecha'],
                'titulo': act['titulo'],
                'descripcion': act['descripcion'] or '',
                'solucion': act['solucion'] or '',
                'direccion': act['direccion'] or '',
                'hora': act['hora'] or '',
                'cumplida': bool(act['cumplida']),
                'orden': act['orden'],
                'created_at': act['created_at']
            })
        
        return jsonify(resultado)
    
    except Exception as e:
        print(f"❌ Error en get_actividades: {e}")
        return jsonify({'error': str(e), 'detalle': 'Error al obtener actividades'}), 500
    
    finally:
        conn.close()

@app.route('/api/actividades', methods=['POST'])
def crear_actividad():
    """Crea una nueva actividad"""
    data = request.json
    fecha = data.get('fecha')
    titulo = data.get('titulo')
    descripcion = data.get('descripcion', '')
    solucion = data.get('solucion', '')
    direccion = data.get('direccion', '')
    hora = data.get('hora', '')
    
    if not fecha or not titulo:
        return jsonify({'error': 'Fecha y título son obligatorios'}), 400
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Obtener el máximo orden para esa fecha
        cur.execute(
            'SELECT COALESCE(MAX(orden), -1) + 1 as nuevo_orden FROM actividades WHERE fecha = ?',
            (fecha,)
        )
        row = cur.fetchone()
        nuevo_orden = row['nuevo_orden'] if row else 0
        
        # Insertar nueva actividad con todos los campos
        cur.execute('''
            INSERT INTO actividades (fecha, titulo, descripcion, solucion, direccion, hora, orden)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (fecha, titulo, descripcion, solucion, direccion, hora, nuevo_orden))
        
        conn.commit()
        
        # Obtener la actividad recién creada
        cur.execute('SELECT * FROM actividades WHERE id = last_insert_rowid()')
        nueva_actividad = cur.fetchone()
        
        if not nueva_actividad:
            return jsonify({'error': 'Error al crear la actividad'}), 500
        
        return jsonify({
            'id': nueva_actividad['id'],
            'fecha': nueva_actividad['fecha'],
            'titulo': nueva_actividad['titulo'],
            'descripcion': nueva_actividad['descripcion'] or '',
            'solucion': nueva_actividad['solucion'] or '',
            'direccion': nueva_actividad['direccion'] or '',
            'hora': nueva_actividad['hora'] or '',
            'cumplida': bool(nueva_actividad['cumplida']),
            'orden': nueva_actividad['orden'],
            'created_at': nueva_actividad['created_at']
        }), 201
    
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en crear_actividad: {e}")
        return jsonify({'error': str(e)}), 500
    
    finally:
        conn.close()

@app.route('/api/actividades/<int:id>', methods=['PUT'])
def actualizar_actividad(id):
    """Actualiza una actividad existente"""
    data = request.json
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Verificar si la actividad existe
        cur.execute('SELECT * FROM actividades WHERE id = ?', (id,))
        if not cur.fetchone():
            return jsonify({'error': 'Actividad no encontrada'}), 404
        
        # Construir la consulta dinámicamente
        updates = []
        params = []
        
        if 'cumplida' in data:
            updates.append('cumplida = ?')
            params.append(1 if data['cumplida'] else 0)
        
        if 'fecha' in data and data['fecha']:
            updates.append('fecha = ?')
            params.append(data['fecha'])
        
        if 'titulo' in data and data['titulo']:
            updates.append('titulo = ?')
            params.append(data['titulo'])
        
        if 'descripcion' in data:
            updates.append('descripcion = ?')
            params.append(data['descripcion'])
        
        if 'solucion' in data:
            updates.append('solucion = ?')
            params.append(data['solucion'])
        
        if 'direccion' in data:
            updates.append('direccion = ?')
            params.append(data['direccion'])
        
        if 'hora' in data:
            updates.append('hora = ?')
            params.append(data['hora'])
        
        if not updates:
            return jsonify({'error': 'No se proporcionaron campos para actualizar'}), 400
        
        params.append(id)
        query = f"UPDATE actividades SET {', '.join(updates)} WHERE id = ?"
        cur.execute(query, params)
        conn.commit()
        
        # Obtener la actividad actualizada
        cur.execute('SELECT * FROM actividades WHERE id = ?', (id,))
        actividad = cur.fetchone()
        
        if not actividad:
            return jsonify({'error': 'Actividad no encontrada'}), 404
        
        return jsonify({
            'id': actividad['id'],
            'fecha': actividad['fecha'],
            'titulo': actividad['titulo'],
            'descripcion': actividad['descripcion'] or '',
            'solucion': actividad['solucion'] or '',
            'direccion': actividad['direccion'] or '',
            'hora': actividad['hora'] or '',
            'cumplida': bool(actividad['cumplida']),
            'orden': actividad['orden'],
            'created_at': actividad['created_at']
        })
    
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en actualizar_actividad: {e}")
        return jsonify({'error': str(e)}), 500
    
    finally:
        conn.close()

@app.route('/api/actividades/<int:id>', methods=['DELETE'])
def eliminar_actividad(id):
    """Elimina una actividad"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        cur.execute('DELETE FROM actividades WHERE id = ?', (id,))
        
        if cur.rowcount == 0:
            return jsonify({'error': 'Actividad no encontrada'}), 404
        
        conn.commit()
        return jsonify({'message': 'Actividad eliminada correctamente'}), 200
    
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en eliminar_actividad: {e}")
        return jsonify({'error': str(e)}), 500
    
    finally:
        conn.close()

@app.route('/api/actividades/reordenar', methods=['POST'])
def reordenar_actividades():
    """Actualiza el orden de las actividades"""
    data = request.json
    actividades = data.get('actividades', [])
    
    if not actividades:
        return jsonify({'error': 'No se proporcionaron actividades'}), 400
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        for idx, act in enumerate(actividades):
            cur.execute(
                'UPDATE actividades SET orden = ? WHERE id = ?',
                (idx, act['id'])
            )
        
        conn.commit()
        return jsonify({'message': 'Orden actualizado correctamente'}), 200
    
    except Exception as e:
        conn.rollback()
        print(f"❌ Error en reordenar_actividades: {e}")
        return jsonify({'error': str(e)}), 500
    
    finally:
        conn.close()

@app.route('/api/estadisticas', methods=['GET'])
def get_estadisticas():
    """Obtiene estadísticas generales"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Total de actividades
        cur.execute('SELECT COUNT(*) as total FROM actividades')
        total = cur.fetchone()['total']
        
        # Actividades cumplidas
        cur.execute('SELECT COUNT(*) as cumplidas FROM actividades WHERE cumplida = 1')
        cumplidas = cur.fetchone()['cumplidas']
        
        # Actividades por día (últimos 7 días)
        cur.execute('''
            SELECT fecha, COUNT(*) as count 
            FROM actividades 
            WHERE fecha >= date('now', '-7 days')
            GROUP BY fecha 
            ORDER BY fecha
        ''')
        ultimos_dias = cur.fetchall()
        
        return jsonify({
            'total': total,
            'cumplidas': cumplidas,
            'pendientes': total - cumplidas,
            'ultimos_dias': [{'fecha': row['fecha'], 'count': row['count']} for row in ultimos_dias]
        })
    
    except Exception as e:
        print(f"❌ Error en get_estadisticas: {e}")
        return jsonify({'error': str(e)}), 500
    
    finally:
        conn.close()

# Inicializar la base de datos al arrancar
if __name__ == '__main__':
    print("🚀 Iniciando servidor...")
    print(f"🐍 Python version: {sys.version}")
    init_db()
    print("🌐 Servidor corriendo en http://localhost:5000")
    print("📋 Presiona Ctrl+C para detener el servidor")
    app.run(debug=True, host='0.0.0.0', port=5000)