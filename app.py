import os
import logging
import json
from flask import Flask, render_template, request, jsonify, session
from flask_session import Session
from werkzeug.middleware.proxy_fix import ProxyFix

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Ensure required directories exist before starting
# This is critical for the proper functioning of the application
os.makedirs('static/hls', exist_ok=True)
os.makedirs('flask_session', exist_ok=True)

# Create Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev_secret_key")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Configure session to use filesystem
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = True
app.config["SESSION_FILE_DIR"] = "flask_session"
app.config["SESSION_USE_SIGNER"] = True
Session(app)

# Import stream module
from rtsp_stream import RTSPStream

# Global stream manager
rtsp_manager = None

@app.route('/')
def index():
    # Get camera settings from session or use defaults
    camera_settings = session.get('camera_settings', {
        'ip': '',
        'port': '554',
        'username': '',
        'password': '',
        'channel': '1',
        'main_stream_path': 'Streaming/Channels/101',
        'sub_stream_path': 'Streaming/Channels/102'
    })
    
    return render_template('index.html', camera_settings=camera_settings)

@app.route('/save_settings', methods=['POST'])
def save_settings():
    try:
        camera_settings = {
            'ip': request.form.get('ip', ''),
            'port': request.form.get('port', '554'),
            'username': request.form.get('username', ''),
            'password': request.form.get('password', ''),
            'channel': request.form.get('channel', '1'),
            'main_stream_path': request.form.get('main_stream_path', 'Streaming/Channels/101'),
            'sub_stream_path': request.form.get('sub_stream_path', 'Streaming/Channels/102')
        }
        
        # Save to session
        session['camera_settings'] = camera_settings
        
        # Stop any existing stream
        global rtsp_manager
        if rtsp_manager:
            rtsp_manager.stop_stream()
        
        # Create new RTSP Stream Manager
        rtsp_manager = RTSPStream(camera_settings)
        
        return jsonify({'success': True, 'message': 'Settings saved successfully'})
    except Exception as e:
        logger.error(f"Error saving settings: {str(e)}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@app.route('/start_stream', methods=['POST'])
def start_stream():
    try:
        stream_type = request.form.get('stream_type', 'main')
        
        if not session.get('camera_settings'):
            return jsonify({'success': False, 'message': 'No camera settings found. Please configure your camera first.'}), 400
        
        global rtsp_manager
        if not rtsp_manager:
            rtsp_manager = RTSPStream(session['camera_settings'])
        
        # Start the stream
        stream_url = rtsp_manager.start_stream(stream_type)
        
        return jsonify({'success': True, 'stream_url': stream_url})
    except Exception as e:
        logger.error(f"Error starting stream: {str(e)}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

@app.route('/stop_stream', methods=['POST'])
def stop_stream():
    try:
        global rtsp_manager
        if rtsp_manager:
            rtsp_manager.stop_stream()
        
        return jsonify({'success': True, 'message': 'Stream stopped'})
    except Exception as e:
        logger.error(f"Error stopping stream: {str(e)}")
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

if __name__ == '__main__':
    # Create directory for HLS segments if it doesn't exist
    os.makedirs('static/hls', exist_ok=True)
    # Create directory for session files
    os.makedirs('flask_session', exist_ok=True)
    
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
