document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const videoPlayer = document.getElementById('videoPlayer');
    const streamToggleBtn = document.getElementById('streamToggleBtn');
    const streamTypeBtn = document.getElementById('streamTypeBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const settingsAlert = document.getElementById('settingsAlert');
    const noStreamMessage = document.getElementById('noStreamMessage');
    const streamStatus = document.getElementById('streamStatus');
    const currentStreamType = document.getElementById('currentStreamType');
    const cameraIp = document.getElementById('cameraIp');
    const streamPath = document.getElementById('streamPath');
    
    // State variables
    let isStreaming = false;
    let currentStream = 'main'; // 'main' or 'sub'
    let player = null;
    
    // Initialize the video.js player
    function initPlayer() {
        // If player already exists, dispose it
        if (player) {
            player.dispose();
        }
        
        // Create new player
        player = videojs('videoPlayer', {
            controls: true,
            autoplay: true,
            preload: 'auto',
            fluid: true,
            html5: {
                hls: {
                    overrideNative: true
                }
            }
        });
        
        // Add error handling
        player.on('error', function() {
            console.error('Video player error:', player.error());
            showAlert('Error playing stream. Please check your camera settings.', 'danger');
            stopStream();
        });
    }
    
    // Start streaming
    function startStream() {
        if (isStreaming) return;
        
        // Show loading message
        streamStatus.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Connecting...';
        
        // Make API call to start the stream
        fetch('/start_stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `stream_type=${currentStream}`
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Stream started successfully
                isStreaming = true;
                
                // Update UI
                updateStreamingUI(true);
                
                // Initialize player if needed
                if (!player) {
                    initPlayer();
                }
                
                // Hide no stream message and show video player
                noStreamMessage.classList.add('d-none');
                videoPlayer.classList.remove('d-none');
                
                // Set the source and start playing
                player.src({
                    src: data.stream_url,
                    type: 'application/x-mpegURL'
                });
                
                player.play().catch(e => {
                    console.warn('Autoplay prevented:', e);
                });
                
                // Update stream info display
                updateStreamInfo();
            } else {
                // Handle error
                showAlert(data.message || 'Failed to start stream', 'danger');
                stopStream();
            }
        })
        .catch(error => {
            console.error('Error starting stream:', error);
            showAlert('Error connecting to server', 'danger');
            stopStream();
        });
    }
    
    // Stop streaming
    function stopStream() {
        if (!isStreaming) return;
        
        // Call API to stop stream
        fetch('/stop_stream', {
            method: 'POST',
        })
        .then(response => response.json())
        .then(data => {
            console.log('Stream stopped:', data);
        })
        .catch(error => {
            console.error('Error stopping stream:', error);
        })
        .finally(() => {
            // Update UI regardless of server response
            isStreaming = false;
            updateStreamingUI(false);
            
            // Stop and hide video player
            if (player) {
                player.pause();
                videoPlayer.classList.add('d-none');
            }
            
            // Show no stream message
            noStreamMessage.classList.remove('d-none');
            
            // Update stream info display
            updateStreamInfo();
        });
    }
    
    // Toggle stream function
    function toggleStream() {
        if (isStreaming) {
            stopStream();
        } else {
            startStream();
        }
    }
    
    // Switch stream type
    function switchStreamType() {
        // Toggle between main and sub streams
        currentStream = currentStream === 'main' ? 'sub' : 'main';
        
        // Update button text
        streamTypeBtn.innerHTML = `<i class="fas fa-exchange-alt me-1"></i>Switch to ${currentStream === 'main' ? 'Sub' : 'Main'} Stream`;
        
        // If currently streaming, restart with new stream type
        if (isStreaming) {
            stopStream();
            setTimeout(() => {
                startStream();
            }, 1000); // Give a second for cleanup
        }
    }
    
    // Toggle fullscreen
    function toggleFullscreen() {
        if (player) {
            if (!player.isFullscreen()) {
                player.requestFullscreen();
            } else {
                player.exitFullscreen();
            }
        }
    }
    
    // Save camera settings
    function saveSettings() {
        // Get form data
        const form = document.getElementById('cameraSettingsForm');
        const formData = new FormData(form);
        
        // Show loading state
        saveSettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving...';
        saveSettingsBtn.disabled = true;
        
        // Submit form data
        fetch('/save_settings', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success message
                showSettingsAlert(data.message, 'success');
                
                // Update camera info display
                cameraIp.textContent = formData.get('ip');
                
                // Enable stream buttons
                streamToggleBtn.disabled = false;
                streamTypeBtn.disabled = false;
                fullscreenBtn.disabled = false;
                
                // If stream was running, restart it
                if (isStreaming) {
                    stopStream();
                    setTimeout(() => {
                        startStream();
                    }, 1000);
                }
                
                // Auto-close modal after delay
                setTimeout(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
                    if (modal) {
                        modal.hide();
                    }
                    // Clear alert after modal closes
                    setTimeout(() => {
                        settingsAlert.classList.add('d-none');
                    }, 500);
                }, 1500);
            } else {
                // Show error
                showSettingsAlert(data.message || 'Failed to save settings', 'danger');
            }
        })
        .catch(error => {
            console.error('Error saving settings:', error);
            showSettingsAlert('Error connecting to server', 'danger');
        })
        .finally(() => {
            // Reset button state
            saveSettingsBtn.innerHTML = 'Save Settings';
            saveSettingsBtn.disabled = false;
        });
    }
    
    // Show alert in settings modal
    function showSettingsAlert(message, type) {
        settingsAlert.textContent = message;
        settingsAlert.className = `alert alert-${type}`;
        settingsAlert.classList.remove('d-none');
    }
    
    // Show alert as toast
    function showAlert(message, type) {
        // You could implement a toast notification here
        console.log(`Alert [${type}]: ${message}`);
    }
    
    // Update UI based on streaming state
    function updateStreamingUI(isActive) {
        if (isActive) {
            streamToggleBtn.innerHTML = '<i class="fas fa-stop me-1"></i>Stop Stream';
            streamToggleBtn.classList.remove('btn-outline-secondary');
            streamToggleBtn.classList.add('btn-danger');
            streamStatus.innerHTML = '<span class="status-indicator status-online"></span>Online';
        } else {
            streamToggleBtn.innerHTML = '<i class="fas fa-play me-1"></i>Start Stream';
            streamToggleBtn.classList.remove('btn-danger');
            streamToggleBtn.classList.add('btn-outline-secondary');
            streamStatus.innerHTML = '<span class="status-indicator status-offline"></span>Offline';
        }
    }
    
    // Update stream information display
    function updateStreamInfo() {
        const settings = getCameraSettings();
        
        // Display current stream type
        currentStreamType.textContent = currentStream === 'main' ? 'Main Stream' : 'Sub Stream';
        
        // Display camera IP if available
        if (settings.ip) {
            cameraIp.textContent = settings.ip;
        }
        
        // Display stream path based on current stream type
        if (currentStream === 'main') {
            streamPath.textContent = settings.main_stream_path || 'Streaming/Channels/101';
        } else {
            streamPath.textContent = settings.sub_stream_path || 'Streaming/Channels/102';
        }
    }
    
    // Get camera settings from form
    function getCameraSettings() {
        const form = document.getElementById('cameraSettingsForm');
        const formData = new FormData(form);
        const settings = {};
        
        for (const [key, value] of formData.entries()) {
            settings[key] = value;
        }
        
        return settings;
    }
    
    // Check if camera is already configured on page load
    function checkInitialConfig() {
        const ipInput = document.getElementById('cameraIpInput');
        
        if (ipInput && ipInput.value) {
            // Camera is configured, enable stream buttons
            streamToggleBtn.disabled = false;
            streamTypeBtn.disabled = false;
            fullscreenBtn.disabled = false;
            
            // Update camera info display
            cameraIp.textContent = ipInput.value;
            
            // Set initial stream path display
            updateStreamInfo();
        }
    }
    
    // Register event listeners
    streamToggleBtn.addEventListener('click', toggleStream);
    streamTypeBtn.addEventListener('click', switchStreamType);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    saveSettingsBtn.addEventListener('click', saveSettings);
    
    // Initialize player when page loads
    initPlayer();
    
    // Check initial configuration
    checkInitialConfig();
});
