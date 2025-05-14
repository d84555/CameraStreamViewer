import os
import logging
import subprocess
import signal
import time
import threading
from urllib.parse import quote

logger = logging.getLogger(__name__)

class RTSPStream:
    def __init__(self, camera_settings):
        self.camera_settings = camera_settings
        self.stream_process = None
        self.stop_event = threading.Event()
        self.current_stream_type = None
        self.hls_output_dir = os.path.join('static', 'hls')
        
        # Ensure HLS directory exists - do this immediately on initialization
        # and make sure it's writable
        os.makedirs(self.hls_output_dir, exist_ok=True)
        
        # Create a test file to verify directory is writable
        test_file_path = os.path.join(self.hls_output_dir, 'test.txt')
        try:
            with open(test_file_path, 'w') as f:
                f.write('test')
            os.remove(test_file_path)
            logger.info(f"HLS directory {self.hls_output_dir} is writable")
        except Exception as e:
            logger.error(f"HLS directory {self.hls_output_dir} is not writable: {str(e)}")

    def _build_rtsp_url(self, stream_type):
        """Build the RTSP URL based on the camera settings and stream type"""
        ip = self.camera_settings.get('ip', '')
        port = self.camera_settings.get('port', '554')
        username = self.camera_settings.get('username', '')
        password = self.camera_settings.get('password', '')
        
        # Choose the appropriate stream path
        if stream_type == 'main':
            stream_path = self.camera_settings.get('main_stream_path', 'Streaming/Channels/101')
        else:  # sub stream
            stream_path = self.camera_settings.get('sub_stream_path', 'Streaming/Channels/102')
        
        # Construct authentication part if credentials are provided
        auth_part = ''
        if username and password:
            # URL encode the username and password
            username_encoded = quote(username)
            password_encoded = quote(password)
            auth_part = f"{username_encoded}:{password_encoded}@"
        
        # Construct the final RTSP URL
        return f"rtsp://{auth_part}{ip}:{port}/{stream_path}"

    def start_stream(self, stream_type='main'):
        """Start the RTSP stream conversion to HLS"""
        try:
            # Stop any existing stream first
            self.stop_stream()
            
            # Make sure the directory exists
            os.makedirs(self.hls_output_dir, exist_ok=True)
            
            rtsp_url = self._build_rtsp_url(stream_type)
            self.current_stream_type = stream_type
            
            # Clear any existing HLS segments
            for file in os.listdir(self.hls_output_dir):
                if file.endswith('.ts') or file.endswith('.m3u8'):
                    try:
                        os.remove(os.path.join(self.hls_output_dir, file))
                    except Exception as e:
                        logger.warning(f"Could not remove file {file}: {str(e)}")
            
            # Build ffmpeg command
            hls_path = os.path.join(self.hls_output_dir, 'stream.m3u8')
            segment_path = os.path.join(self.hls_output_dir, 'segment_%03d.ts')
            
            # Construct ffmpeg command with improved flags
            cmd = [
                'ffmpeg',
                '-rtsp_transport', 'tcp',  # Use TCP for RTSP (more reliable)
                '-i', rtsp_url,
                '-c:v', 'copy',  # Copy video codec (no re-encoding)
                '-c:a', 'aac',   # AAC for audio
                '-hls_time', '2',  # Each segment will be approximately 2 seconds
                '-hls_list_size', '10',  # Keep 10 segments in the playlist
                '-hls_flags', 'delete_segments+append_list',  # Delete old segments and append to list
                '-hls_segment_filename', segment_path,
                '-f', 'hls',
                hls_path
            ]
            
            # Log the command (without credentials)
            safe_cmd = cmd.copy()
            if username := self.camera_settings.get('username'):
                safe_rtsp_url = rtsp_url.replace(f"{username}:{self.camera_settings.get('password', '')}@", "***:***@")
                safe_cmd[safe_cmd.index(rtsp_url)] = safe_rtsp_url
            logger.debug(f"Starting ffmpeg with command: {' '.join(safe_cmd)}")
            
            # Start ffmpeg process
            self.stream_process = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid
            )
            
            # Wait a moment for ffmpeg to start generating segments
            # Increased from 3 to 5 seconds to ensure files are properly generated
            time.sleep(5)
            
            # Verify the m3u8 file exists
            if not os.path.exists(hls_path):
                stdout, stderr = self.stream_process.communicate()
                logger.error(f"ffmpeg process failed to create m3u8 file: {stderr.decode('utf-8')}")
                raise Exception("Failed to create HLS stream files. Check ffmpeg output.")
            
            # Check if process is still running
            if self.stream_process.poll() is not None:
                stdout, stderr = self.stream_process.communicate()
                logger.error(f"ffmpeg process failed: {stderr.decode('utf-8')}")
                raise Exception("Failed to start streaming. Check camera settings and connectivity.")
            
            # Start a monitoring thread
            self.stop_event.clear()
            monitor_thread = threading.Thread(target=self._monitor_stream)
            monitor_thread.daemon = True
            monitor_thread.start()
            
            # Return the HLS URL relative to static directory
            return '/static/hls/stream.m3u8'
            
        except Exception as e:
            logger.error(f"Error starting stream: {str(e)}")
            self.stop_stream()
            raise
    
    def _monitor_stream(self):
        """Monitor the ffmpeg process and restart if it fails"""
        while not self.stop_event.is_set():
            if self.stream_process and self.stream_process.poll() is not None:
                # Process has terminated unexpectedly
                stdout, stderr = self.stream_process.communicate()
                logger.error(f"ffmpeg process terminated: {stderr.decode('utf-8')}")
                
                # Try to restart the stream
                try:
                    # Ensure we have a valid stream type
                    stream_type = self.current_stream_type or 'main'
                    self.start_stream(stream_type)
                    logger.info("Stream restarted successfully")
                except Exception as e:
                    logger.error(f"Failed to restart stream: {str(e)}")
            
            # Sleep for a while before checking again
            time.sleep(5)
    
    def stop_stream(self):
        """Stop the RTSP stream conversion"""
        try:
            if self.stream_process:
                self.stop_event.set()
                
                # Send SIGTERM to the process group
                try:
                    os.killpg(os.getpgid(self.stream_process.pid), signal.SIGTERM)
                except OSError:
                    pass
                
                # Wait for process to terminate
                try:
                    self.stream_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # Force kill if not terminated
                    try:
                        os.killpg(os.getpgid(self.stream_process.pid), signal.SIGKILL)
                    except OSError:
                        pass
                
                self.stream_process = None
                logger.info("Stream process stopped")
                
            # Attempt to clean up HLS segments
            try:
                for file in os.listdir(self.hls_output_dir):
                    if file.endswith('.ts') or file.endswith('.m3u8'):
                        os.remove(os.path.join(self.hls_output_dir, file))
            except Exception as e:
                logger.warning(f"Error cleaning up HLS segments: {str(e)}")
            
        except Exception as e:
            logger.error(f"Error stopping stream: {str(e)}")
            raise
