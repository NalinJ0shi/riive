window.onload = () => {
    // 1. Setup the Pixi Engine
    const app = new PIXI.Application({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x121212,
        antialias: true,
        resizeTo: window
    });
    document.getElementById('canvas-container').appendChild(app.view);

    // 2. The "Figma" World Container
    const world = new PIXI.Container();
    app.stage.addChild(world);

    const zoomDisplay = document.getElementById('zoom-display');

    // 3. MOUSE WHEEL ZOOM
    app.view.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.0015;
        const delta = -e.deltaY;
        const scaleFactor = Math.pow(1.1, delta / 100); // Smoother exponential zoom

        // Get mouse position relative to the world
        const mousePos = app.renderer.events.pointer.global;
        const localPos = world.toLocal(mousePos);
        
        // Apply Zoom
        world.scale.x *= scaleFactor;
        world.scale.y *= scaleFactor;

        // Reposition world so we zoom INTO the mouse point
        const newMousePos = world.toGlobal(localPos);
        world.x -= (newMousePos.x - mousePos.x);
        world.y -= (newMousePos.y - mousePos.y);

        zoomDisplay.innerText = `Zoom: ${Math.round(world.scale.x * 100)}%`;
    }, { passive: false });

    // 4. PANNING (Right Click or Middle Click)
    let isPanning = false;
    app.view.onmousedown = (e) => {
        if (e.button === 1 || e.button === 2) isPanning = true;
    };
    window.addEventListener('mouseup', () => isPanning = false);
    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            world.x += e.movementX;
            world.y += e.movementY;
        }
    });

    // Disable context menu so Right-Click doesn't pop up
    app.view.oncontextmenu = (e) => e.preventDefault();

    // 5. IMPORT IMAGES
    const fileInput = document.getElementById('image-upload');
    fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const texture = PIXI.Texture.from(e.target.result);
            const sprite = new PIXI.Sprite(texture);
            
            sprite.anchor.set(0.5);
            
            // Place in the center of the CURRENT screen view
            const centerOfScreen = new PIXI.Point(window.innerWidth / 2, window.innerHeight / 2);
            const localCenter = world.toLocal(centerOfScreen);
            sprite.x = localCenter.x;
            sprite.y = localCenter.y;

            // Make Sprite Draggable inside the world
            enableSpriteDragging(sprite);
            
            world.addChild(sprite);
        };
        reader.readAsDataURL(file);
    };

    // 6. DRAG & DROP ENGINE
    function enableSpriteDragging(sprite) {
        sprite.eventMode = 'static';
        sprite.cursor = 'grab';

        sprite.on('pointerdown', (e) => {
            sprite.dragging = true;
            sprite.alpha = 0.8;
            sprite.cursor = 'grabbing';
            // Save initial click offset
            const mousePos = e.data.getLocalPosition(sprite.parent);
            sprite.offset = { x: sprite.x - mousePos.x, y: sprite.y - mousePos.y };
        });

        window.addEventListener('pointermove', (e) => {
            if (sprite.dragging) {
                // We use globalToLocal to ensure dragging works regardless of Zoom level
                const rect = app.view.getBoundingClientRect();
                const globalMouse = new PIXI.Point(e.clientX - rect.left, e.clientY - rect.top);
                const localMouse = world.toLocal(globalMouse);
                
                sprite.x = localMouse.x + sprite.offset.x;
                sprite.y = localMouse.y + sprite.offset.y;
            }
        });

        window.addEventListener('pointerup', () => {
            if (sprite.dragging) {
                sprite.dragging = false;
                sprite.alpha = 1;
                sprite.cursor = 'grab';
            }
        });
    }
};