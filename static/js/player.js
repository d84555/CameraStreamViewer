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
            try {
                player.dispose();
            } catch (e) {
                console.warn('Error disposing player:', e);
            }
        }
        
        // Create new player with improved options
        player = videojs('videoPlayer', {
            controls: true,
            autoplay: false, // Changed to false to control playback explicitly
            preload: 'auto',
            fluid: true,
            liveui: true, // Enable live UI controls
            responsive: true,
            html5: {
                hls: {
                    overrideNative: true,
                    enableLowInitialPlaylist: true, // Start with lower quality for faster initial loading
                    limitRenditionByPlayerDimensions: true
                },
                nativeVideoTracks: false,
                nativeAudioTracks: false
            }
        });
        
        // Add error handling with better error reporting
        player.on('error', function() {
            const error = player.error();
            console.error('Video player error:', error);
            let errorMessage = 'Error playing stream.';
            
            // Provide more specific error messages based on error code
            if (error && error.code) {
                switch (error.code) {
                    case 1: // MEDIA_ERR_ABORTED
                        errorMessage = 'The video playback was aborted.';
                        break;
                    case 2: // MEDIA_ERR_NETWORK
                        errorMessage = 'A network error caused the video download to fail.';
                        break;
                    case 3: // MEDIA_ERR_DECODE
                        errorMessage = 'The video playback was aborted due to a corruption problem.';
                        break;
                    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                        errorMessage = 'The stream format is not supported. Please check if HLS file is properly generated.';
                        break;
                    default:
                        errorMessage = `Error playing stream (code: ${error.code}).`;
                }
            }
            
            showAlert(errorMessage + ' Please check your camera settings.', 'danger');
            stopStream();
        });
        
        // Log successful player initialization
        console.log('Video.js player initialized successfully');
        
        // Add event listeners for debugging
        player.on('loadstart', () => console.log('Video loadstart event fired'));
        player.on('waiting', () => console.log('Video waiting for data'));
        player.on('playing', () => console.log('Video playing event fired'));
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
                
                // Update UI to show connecting status
                updateStreamingUI(true);
                streamStatus.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Preparing stream...';
                
                // Initialize player if needed
                if (!player) {
                    initPlayer();
                }
                
                // Hide no stream message and show video player
                noStreamMessage.classList.add('d-none');
                videoPlayer.classList.remove('d-none');
                
                // IMPORTANT: Add a delay before loading the video
                // This ensures the HLS segments are properly generated
                console.log('Waiting for HLS segments to be ready...');
                setTimeout(() => {
                    console.log('Loading video player with URL:', data.stream_url);
                    
                    // Check if video tag still exists (user didn't navigate away)
                    if (document.getElementById('videoPlayer')) {
                        // Set the source and start playing
                        player.src({
                            src: data.stream_url + '?t=' + new Date().getTime(), // Add timestamp to prevent caching
                            type: 'application/x-mpegURL'
                        });
                        
                        player.play().catch(e => {
                            console.warn('Autoplay prevented:', e);
                        });
                        
                        // Update final streaming status
                        streamStatus.innerHTML = '<span class="status-indicator status-online"></span>Online';
                        
                        // Update stream info display
                        updateStreamInfo();
                    }
                }, 5000); // Wait 5 seconds before loading the video
                
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
        console.log(`Alert [${type}]: ${message}`);
        
        // Create bootstrap alert
        const alertContainer = document.createElement('div');
        alertContainer.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertContainer.style.top = '20px';
        alertContainer.style.right = '20px';
        alertContainer.style.zIndex = '9999';
        alertContainer.style.maxWidth = '400px';
        
        // Add message and close button
        alertContainer.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // Add to document
        document.body.appendChild(alertContainer);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertContainer.parentNode) {
                alertContainer.classList.remove('show');
                setTimeout(() => {
                    if (alertContainer.parentNode) {
                        alertContainer.parentNode.removeChild(alertContainer);
                    }
                }, 300);
            }
        }, 5000);
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
