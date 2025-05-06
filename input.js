// Input holds a snapshot of input state
export default class Input {
	// Digital input (e.g keyboard state)
	digital = {
		forward: false,
		backward: false,
		left: false,
		right: false,
		up: false,
		down: false,
	};

	// Analog input (e.g mouse, touchscreen)
	analog = {
		x: 0,
		y: 0,
		zoom: 0,
		touching: false,
	};
}

// InputHandler is a function that when called, returns the current Input state.
export function createInputHandler(window, canvas, fileHandler) {
	const digital = {
		forward: false,
		backward: false,
		left: false,
		right: false,
		up: false,
		down: false,
	};
	const analog = {
		x: 0,
		y: 0,
		zoom: 0,
	};
	let mouseDown = false;

	const setDigital = (e, value) => {
		switch (e.code) {
			case 'KeyW':
				digital.forward = value;
				e.preventDefault();
				e.stopPropagation();
				break;
			case 'KeyS':
				digital.backward = value;
				e.preventDefault();
				e.stopPropagation();
				break;
			case 'KeyA':
				digital.left = value;
				e.preventDefault();
				e.stopPropagation();
				break;
			case 'KeyD':
				digital.right = value;
				e.preventDefault();
				e.stopPropagation();
				break;
			case 'Space':
				digital.up = value;
				e.preventDefault();
				e.stopPropagation();
				break;
			case 'ShiftLeft':
			case 'ControlLeft':
			case 'KeyC':
				digital.down = value;
				e.preventDefault();
				e.stopPropagation();
				break;
		}
	};

	window.addEventListener('keydown', (e) => setDigital(e, true));
	window.addEventListener('keyup', (e) => setDigital(e, false));

	canvas.style.touchAction = 'pinch-zoom';
	canvas.addEventListener('pointerdown', () => {
		mouseDown = true;
	});
	canvas.addEventListener('pointerup', () => {
		mouseDown = false;
	});
	canvas.addEventListener('pointermove', (e) => {
		mouseDown = e.pointerType == 'mouse' ? (e.buttons & 1) !== 0 : true;
		if (mouseDown) {
			analog.x += e.movementX;
			analog.y += e.movementY;
		}
	});
	canvas.addEventListener('wheel', (e) => {
		mouseDown = (e.buttons & 1) !== 0;
		if (mouseDown) {
			// The scroll value varies substantially between user agents / browsers.
			// Just use the sign.
			analog.zoom += Math.sign(e.deltaY);
			e.preventDefault();
			e.stopPropagation();
		}
	}, { passive: false });


	{
		const dropZone = document.getElementById('drop-zone');

		dropZone.addEventListener('dragover', (event) => {
			event.preventDefault();
		});

		dropZone.addEventListener('drop', (event) => {
			event.preventDefault();
			const files = event.dataTransfer.files;
			if (files.length > 0) {
				fileHandler.handleFiles(files);
			}
		});
	}


	return () => {
		const out = {
			digital,
			analog: {
				x: analog.x,
				y: analog.y,
				zoom: analog.zoom,
				touching: mouseDown,
			},
		};
		// Clear the analog values, as these accumulate.
		analog.x = 0;
		analog.y = 0;
		analog.zoom = 0;
		return out;
	};
}