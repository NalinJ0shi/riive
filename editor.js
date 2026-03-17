window.onload = () => {
    // --- 1. SETUP PIXI ENGINE ---
    const app = new PIXI.Application({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x121212,
        antialias: true,
        resizeTo: window
    });
    document.getElementById('canvas-container').appendChild(app.view);

    const world = new PIXI.Container();
    app.stage.addChild(world);

    // --- 2. STATE, REGISTRY & HISTORY ---
    let currentFrame = 0;
    let isPlaying = false;
    let selectedSprite = null;
    let isBinding = false; 
    let layerCount = 1;
    let spriteRegistry = {}; 

    // NEW: Added the "assets" object to store the image text strings
    let animationData = {
        duration: 150,
        sprites: {},
        hierarchy: {},
        assets: {} 
    };

    

    // --- 3. UI ELEMENTS ---
    const zoomDisplay = document.getElementById('zoom-display');
    const playhead = document.getElementById('playhead');
    const trackContainer = document.getElementById('timeline-track-container');
    const playBtn = document.getElementById('play-btn');
    const addKeyframeBtn = document.getElementById('add-keyframe-btn');
    const bindBtn = document.getElementById('bind-btn'); 
    const frameWidth = 20;
            // --- NEW: PROPERTY SLIDERS LOGIC ---
        const alphaSlider = document.getElementById('alpha-slider');
        const alphaValDisplay = document.getElementById('alpha-val');
        const rotSlider = document.getElementById('rot-slider');
        const rotValDisplay = document.getElementById('rot-val');

        // 1. When the user moves the Alpha slider
        alphaSlider.oninput = (e) => {
            if (!selectedSprite) return;
            const val = parseFloat(e.target.value);
            
            selectedSprite.alpha = val;
            alphaValDisplay.innerText = val.toFixed(1);
            
            updateCurrentKeyframe();
        };

        // 2. When the user moves the Rotation slider
        rotSlider.oninput = (e) => {
            if (!selectedSprite) return;
            const deg = parseInt(e.target.value);
            
            // Pixi uses Radians for rotation, so we convert Degrees to Radians
            selectedSprite.rotation = deg * (Math.PI / 180); 
            rotValDisplay.innerText = `${deg}°`;
            
            updateCurrentKeyframe();
        };
        rotSlider.ondblclick = () => {
            if (!selectedSprite) return;
            
            rotSlider.value = 0;
            selectedSprite.rotation = 0;
            rotValDisplay.innerText = `0°`;
            
            updateCurrentKeyframe();
        };
        // 3. Helper to auto-save if they are parked on an existing keyframe
        function updateCurrentKeyframe() {
            if (!selectedSprite) return;
            const id = selectedSprite.id;
            if (animationData.sprites[id] && animationData.sprites[id][currentFrame]) {
                // saveState() removed from here!
                animationData.sprites[id][currentFrame].alpha = selectedSprite.alpha;
                animationData.sprites[id][currentFrame].rotation = selectedSprite.rotation;
            }
        }

    // --- 4. LAYER & SELECTION MANAGEMENT ---
    function selectSprite(sprite) {
        selectedSprite = sprite;
        
        Object.values(spriteRegistry).forEach(c => c.tint = 0xFFFFFF);
        if (sprite) sprite.tint = 0x007AFF;
        
        document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('active'));
        if (sprite) {
            const activeLayer = document.getElementById(`layer-${sprite.id}`);
            if (activeLayer) activeLayer.classList.add('active');
        }

        renderKeyMarkers();
    }

    function addLayerToPanel(sprite, name) {
        const list = document.getElementById('layers-list');
        if (!list) return;
        
        const li = document.createElement('li');
        li.className = 'layer-item';
        li.id = `layer-${sprite.id}`;
        li.innerText = name;
        
        li.onclick = () => selectSprite(sprite);
        list.appendChild(li);
    }

    // --- 5. VIEWPORT LOGIC (ZOOM & PAN) ---
    app.view.addEventListener('wheel', (e) => {
        e.preventDefault();
        const scaleFactor = Math.pow(1.1, -e.deltaY / 100);
        const mousePos = app.renderer.events.pointer.global;
        const localPos = world.toLocal(mousePos);
        
        world.scale.x *= scaleFactor; world.scale.y *= scaleFactor;

        const newMousePos = world.toGlobal(localPos);
        world.x -= (newMousePos.x - mousePos.x); world.y -= (newMousePos.y - mousePos.y);

        zoomDisplay.innerText = `Zoom: ${Math.round(world.scale.x * 100)}%`;
    }, { passive: false });

    let isPanning = false;
    app.view.onmousedown = (e) => { if (e.button === 1 || e.button === 2) isPanning = true; };
    window.addEventListener('mouseup', () => isPanning = false);
    window.addEventListener('mousemove', (e) => { if (isPanning) { world.x += e.movementX; world.y += e.movementY; } });
    app.view.oncontextmenu = (e) => e.preventDefault();

    // --- 6. ASSET IMPORT (UPDATED FOR BASE64) ---
    const fileInput = document.getElementById('image-upload');
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            // e.target.result is the Base64 text string of your image
            const base64ImageString = e.target.result; 
            
            const texture = PIXI.Texture.from(base64ImageString);
            const sprite = new PIXI.Sprite(texture);
            sprite.id = "sprite_" + Date.now();
            sprite.anchor.set(0.5);
            
            const localCenter = world.toLocal(new PIXI.Point(window.innerWidth / 2, window.innerHeight / 2));
            sprite.x = localCenter.x;
            sprite.y = localCenter.y;

            spriteRegistry[sprite.id] = sprite;

            // NEW: Save the image string directly into our JSON data!
            animationData.assets[sprite.id] = base64ImageString;

            enableSpriteDragging(sprite);
            world.addChild(sprite);

            addLayerToPanel(sprite, `Layer ${layerCount++}`);
            selectSprite(sprite); 
        };
        reader.readAsDataURL(file);
    };

    // --- 7. PARENTING ENGINE ---
    if (bindBtn) {
        bindBtn.onclick = () => {
            if (!selectedSprite) return alert("Select a child sprite first!");
            
            isBinding = !isBinding;
            bindBtn.classList.toggle('active-bind');
            if (isBinding) {
                document.body.classList.add('binding-mode');
                bindBtn.innerText = "Click target Parent...";
                selectedSprite.eventMode = 'none'; 
            } else {
                document.body.classList.remove('binding-mode');
                bindBtn.innerText = "🔗 Bind to Parent";
                if (selectedSprite) selectedSprite.eventMode = 'static';
            }
        };
    }

    // --- 8. DRAG & DROP ENGINE ---
    function enableSpriteDragging(sprite) {
        sprite.eventMode = 'static';
        sprite.cursor = 'grab';

        sprite.on('pointerdown', (e) => {
            e.stopPropagation();

            if (isBinding) {
                if (sprite !== selectedSprite && selectedSprite) {
                    const globalPos = selectedSprite.getGlobalPosition();
                    sprite.addChild(selectedSprite);
                    
                    const newLocalPos = sprite.toLocal(globalPos);
                    selectedSprite.x = newLocalPos.x;
                    selectedSprite.y = newLocalPos.y;

                    
                    animationData.hierarchy[selectedSprite.id] = sprite.id;
                    
                    selectedSprite.eventMode = 'static';
                    console.log(`Successfully bound!`);
                }
                
                isBinding = false;
                document.body.classList.remove('binding-mode');
                bindBtn.classList.remove('active-bind');
                bindBtn.innerText = "🔗 Bind to Parent";
                selectSprite(sprite);
            } else {
                selectSprite(sprite);
            }

            sprite.dragging = true;
            sprite.alpha = 0.8;
            const mousePos = e.data.getLocalPosition(sprite.parent);
            sprite.offset = { x: sprite.x - mousePos.x, y: sprite.y - mousePos.y };
        });

        window.addEventListener('pointermove', (e) => {
            if (sprite.dragging) {
                const rect = app.view.getBoundingClientRect();
                const globalMouse = new PIXI.Point(e.clientX - rect.left, e.clientY - rect.top);
                const localMouse = sprite.parent.toLocal(globalMouse);
                
                sprite.x = localMouse.x + sprite.offset.x;
                sprite.y = localMouse.y + sprite.offset.y;
            }
        });

        window.addEventListener('pointerup', () => {
            if (sprite.dragging) {
                if (animationData.sprites[sprite.id]?.[currentFrame]) {
                    // saveState() removed from here!
                    animationData.sprites[sprite.id][currentFrame] = { x: sprite.x, y: sprite.y };
                }
                sprite.dragging = false;
                sprite.alpha = 1;
            }
        });
    }

// --- 9. TIMELINE & KEYFRAME LOGIC ---

    // --- 9. TIMELINE & KEYFRAME LOGIC ---
    let selectedKeyframe = null; // NEW: Tracks which keyframe is clicked

    // Add Keyframe
    addKeyframeBtn.onclick = () => {
        if (!selectedSprite) return;
        const id = selectedSprite.id;
        if (!animationData.sprites[id]) animationData.sprites[id] = {};
        animationData.sprites[id][currentFrame] = { 
            x: selectedSprite.x, 
            y: selectedSprite.y,
            rotation: selectedSprite.rotation || 0,
            alpha: selectedSprite.alpha !== undefined ? selectedSprite.alpha : 1 
        };
        // Auto-select the newly created keyframe
        selectedKeyframe = { spriteId: id, frame: currentFrame.toString() };
        renderKeyMarkers();
    };

    function renderKeyMarkers() {
        const track = document.getElementById('keyframes-track');
        track.innerHTML = '';
        
        track.style.width = `${animationData.duration * frameWidth}px`;
        
        if (!selectedSprite || !animationData.sprites[selectedSprite.id]) return;

        const frames = animationData.sprites[selectedSprite.id];
        Object.keys(frames).forEach(f => {
            const marker = document.createElement('div');
            marker.className = 'keyframe-marker';
            marker.style.left = `${f * frameWidth}px`;
            
            // NEW: Highlight the marker if it is currently selected
            if (selectedKeyframe && selectedKeyframe.spriteId === selectedSprite.id && selectedKeyframe.frame === f.toString()) {
                marker.style.backgroundColor = '#ffeb3b'; // Make it yellow
                marker.style.boxShadow = '0 0 5px #ffeb3b';
                marker.style.zIndex = '10'; // Bring to front
            }

            marker.onmousedown = (e) => {
                e.stopPropagation();
                
                // NEW: Select this keyframe on click
                selectedKeyframe = { spriteId: selectedSprite.id, frame: f.toString() };
                renderKeyMarkers(); // Re-render to show the yellow highlight

                let onMove = (moveEvent) => {
                    const rect = trackContainer.getBoundingClientRect();
                    let newX = moveEvent.clientX - rect.left + trackContainer.scrollLeft;
                    let newFrame = Math.max(0, Math.min(animationData.duration - 1, Math.round(newX / frameWidth)));
                    
                    if (newFrame != f) {
                        const data = animationData.sprites[selectedSprite.id][f];
                        delete animationData.sprites[selectedSprite.id][f];
                        animationData.sprites[selectedSprite.id][newFrame] = data;
                        
                        // Update selection to follow the drag
                        selectedKeyframe.frame = newFrame.toString(); 
                        f = newFrame;
                        renderKeyMarkers();
                    }
                };
                let onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            };
            track.appendChild(marker);
        });
    }

    // --- NEW: KEYBOARD LOGIC FOR DELETING KEYFRAMES ---
    window.addEventListener('keydown', (e) => {
        // Check if Delete or Backspace is pressed
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedKeyframe && animationData.sprites[selectedKeyframe.spriteId]) {
                delete animationData.sprites[selectedKeyframe.spriteId][selectedKeyframe.frame];
                selectedKeyframe = null; // Clear selection after deleting
                renderKeyMarkers();
                renderFrame(currentFrame);
            }
        }
    });

    // --- 10. PLAYBACK & SCRUBBING ---
    let isScrubbing = false;
    trackContainer.onmousedown = (e) => {
        // NEW: Clicking anywhere else on the timeline deselects the keyframe
        selectedKeyframe = null;
        renderKeyMarkers(); 

        if (e.target.className.includes('keyframe-marker')) return;
        isScrubbing = true;
        updatePlayheadFromMouse(e);
    };
    window.addEventListener('mousemove', (e) => { if (isScrubbing) updatePlayheadFromMouse(e); });
    window.addEventListener('mouseup', () => isScrubbing = false)
    function updatePlayheadFromMouse(e) {
        const rect = trackContainer.getBoundingClientRect();
        let x = e.clientX - rect.left + trackContainer.scrollLeft;
        currentFrame = Math.max(0, Math.min(animationData.duration - 1, Math.round(x / frameWidth)));
        renderFrame(currentFrame);
    }

    function renderFrame(frame) {
        playhead.style.left = `${frame * frameWidth}px`;
        document.getElementById('current-frame').innerText = `Frame: ${frame}`;

        for (const [id, keyframes] of Object.entries(animationData.sprites)) {
            const sprite = spriteRegistry[id];
            if (!sprite || sprite.dragging) continue;

            const frameKeys = Object.keys(keyframes).map(Number).sort((a, b) => a - b);
            let prev = frameKeys.filter(f => f <= frame).pop();
            let next = frameKeys.filter(f => f > frame)[0];

            if (prev !== undefined && next !== undefined) {
                const progress = (frame - prev) / (next - prev);
                sprite.x = keyframes[prev].x + (keyframes[next].x - keyframes[prev].x) * progress;
                sprite.y = keyframes[prev].y + (keyframes[next].y - keyframes[prev].y) * progress;
                
                // Interpolate Rotation and Alpha
                const prevRot = keyframes[prev].rotation || 0;
                const nextRot = keyframes[next].rotation || 0;
                sprite.rotation = prevRot + (nextRot - prevRot) * progress;

                const prevAlpha = keyframes[prev].alpha !== undefined ? keyframes[prev].alpha : 1;
                const nextAlpha = keyframes[next].alpha !== undefined ? keyframes[next].alpha : 1;
                sprite.alpha = prevAlpha + (nextAlpha - prevAlpha) * progress;

            } else if (prev !== undefined) {
                sprite.x = keyframes[prev].x; 
                sprite.y = keyframes[prev].y;
                
                // Set Static Rotation and Alpha
                sprite.rotation = keyframes[prev].rotation || 0;
                sprite.alpha = keyframes[prev].alpha !== undefined ? keyframes[prev].alpha : 1;
            }
        }

        // --- UI SYNC LOGIC (Must be inside renderFrame!) ---
        if (selectedSprite) {
            alphaSlider.value = selectedSprite.alpha;
            alphaValDisplay.innerText = selectedSprite.alpha.toFixed(1);
            
            // Convert Radians back to Degrees for the UI
            const deg = Math.round(selectedSprite.rotation * (180 / Math.PI));
            rotSlider.value = deg;
            rotValDisplay.innerText = `${deg}°`;
        }
    }

    playBtn.onclick = () => {
        isPlaying = !isPlaying;
        playBtn.innerText = isPlaying ? "Pause" : "Play";
    };

    app.ticker.add(() => {
        if (isPlaying) {
            currentFrame++;
            if (currentFrame >= animationData.duration) currentFrame = 0;
            renderFrame(currentFrame);
        }
    });

    // --- 12. EXPORT TO JSON ---
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.onclick = () => {
            const dataStr = JSON.stringify(animationData, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = "my_animation.json";
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log("Exported!", animationData);
        };
    }
};
