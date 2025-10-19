const PIPE_SEQUENCE = [
  220,
  170,
  250,
  205,
  145,
  235,
  185,
  260
];

const DEFAULT_OPTIONS = Object.freeze({
  width: 340,
  height: 400,
  gapSize: 140,
  pipeWidth: 58,
  pipeSpacing: 190,
  gravity: 0.32,
  flapStrength: -6.4,
  maxFallSpeed: 12,
  baseSpeed: 2.35
});

export class MiniFlappyGame {
  constructor({ container, getAvatar }) {
    this.container = container;
    this.getAvatar = getAvatar;
    this.options = { ...DEFAULT_OPTIONS };

    this.scoreEl = document.createElement('div');
    this.scoreEl.className = 'flappy-score';
    this.scoreEl.textContent = 'Score: 0';

    this.playfield = document.createElement('div');
    this.playfield.className = 'flappy-playfield';

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.className = 'flappy-canvas';
    this.ctx = this.canvas.getContext('2d');

    this.overlay = document.createElement('div');
    this.overlay.className = 'flappy-overlay';

    this.playfield.appendChild(this.canvas);
    this.playfield.appendChild(this.overlay);

    this.container.classList.add('flappy-wrapper');
    this.container.appendChild(this.scoreEl);
    this.container.appendChild(this.playfield);

    this.boundLoop = this.loop.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handlePointer = this.handlePointer.bind(this);

    this.frameHandle = null;
    this.running = false;
    this.hasCrashed = false;
    this.backgroundGradient = null;

    this.reset();
  }

  setAvatar(avatar) {
    this.avatar = avatar;
  }

  reset(message = 'Press space or tap to start') {
    const { width, height, pipeSpacing } = this.options;

    this.pipeCursor = 0;
    this.pipes = [];
    const initialX = width + 40;

    for (let i = 0; i < 4; i += 1) {
      const gapY = PIPE_SEQUENCE[(this.pipeCursor + i) % PIPE_SEQUENCE.length];
      this.pipes.push({
        x: initialX + (i * pipeSpacing),
        gapY,
        counted: false
      });
    }

    this.bird = {
      x: width * 0.35,
      y: height * 0.5,
      radius: 16,
      velocity: 0
    };

    this.score = 0;
    this.scoreEl.textContent = 'Score: 0';
    this.overlay.textContent = message;
    this.overlay.classList.remove('hidden');
    this.gameActive = false;
    this.hasCrashed = false;
    this.hasStarted = false;
    this.lastTimestamp = null;
    this.avatar = this.getAvatar?.() ?? '🙂';
    this.backgroundGradient = null;

    this.drawFrame();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = null;
    window.addEventListener('keydown', this.handleKeyDown);
    this.playfield.addEventListener('pointerdown', this.handlePointer);
    this.frameHandle = requestAnimationFrame(this.boundLoop);
  }

  stop() {
    if (this.frameHandle) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    if (this.running) {
      window.removeEventListener('keydown', this.handleKeyDown);
      this.playfield.removeEventListener('pointerdown', this.handlePointer);
    }
    this.running = false;
    this.reset();
  }

  handleKeyDown(event) {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      this.flap();
    }
  }

  handlePointer(event) {
    event.preventDefault();
    this.flap();
  }

  flap() {
    if (this.hasCrashed) {
      this.reset();
    }

    if (!this.gameActive) {
      this.gameActive = true;
      this.hasStarted = true;
      this.overlay.classList.add('hidden');
    }

    this.bird.velocity = this.options.flapStrength;
  }

  loop(timestamp) {
    if (!this.running) return;

    if (this.lastTimestamp == null) {
      this.lastTimestamp = timestamp;
    }

    const delta = Math.min((timestamp - this.lastTimestamp) / (1000 / 60), 1.6);
    this.lastTimestamp = timestamp;

    if (this.gameActive) {
      this.update(delta);
    }

    this.drawFrame();
    this.frameHandle = requestAnimationFrame(this.boundLoop);
  }

  update(delta) {
    const { gravity, maxFallSpeed, baseSpeed, pipeSpacing, pipeWidth, gapSize } = this.options;

    this.bird.velocity = Math.min(this.bird.velocity + (gravity * delta), maxFallSpeed);
    this.bird.y += this.bird.velocity * delta * 1.45;

    const movement = baseSpeed * delta * 2.25;

    for (const pipe of this.pipes) {
      pipe.x -= movement;

      if (!pipe.counted && pipe.x + pipeWidth < this.bird.x - this.bird.radius) {
        pipe.counted = true;
        this.score += 1;
        this.scoreEl.textContent = `Score: ${this.score}`;
      }

      if (pipe.x + pipeWidth < -80) {
        let maxX = -Infinity;
        for (const other of this.pipes) {
          if (other !== pipe && other.x > maxX) {
            maxX = other.x;
          }
        }
        if (maxX === -Infinity) {
          maxX = pipe.x;
        }
        this.pipeCursor = (this.pipeCursor + 1) % PIPE_SEQUENCE.length;
        pipe.x = maxX + pipeSpacing;
        pipe.gapY = PIPE_SEQUENCE[this.pipeCursor];
        pipe.counted = false;
      }

      const topLimit = pipe.gapY - (gapSize / 2);
      const bottomLimit = pipe.gapY + (gapSize / 2);
      const withinX = this.bird.x + this.bird.radius > pipe.x && this.bird.x - this.bird.radius < pipe.x + pipeWidth;

      if (withinX && (this.bird.y - this.bird.radius < topLimit || this.bird.y + this.bird.radius > bottomLimit)) {
        this.triggerGameOver();
        return;
      }
    }

    const floor = this.options.height - 36;
    const ceiling = 24;

    if (this.bird.y + this.bird.radius >= floor || this.bird.y - this.bird.radius <= ceiling) {
      this.triggerGameOver();
    }
  }

  triggerGameOver() {
    this.gameActive = false;
    this.hasCrashed = true;
    this.overlay.textContent = 'Crash! Press space to try again';
    this.overlay.classList.remove('hidden');
    this.bird.velocity = 0;
  }

  drawFrame() {
    const { width, height, gapSize, pipeWidth } = this.options;
    const ctx = this.ctx;

    if (!this.backgroundGradient) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#6ec3ff');
      gradient.addColorStop(1, '#cfefff');
      this.backgroundGradient = gradient;
    }

    ctx.fillStyle = this.backgroundGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#a7db8c';
    ctx.beginPath();
    ctx.moveTo(0, height - 48);
    ctx.quadraticCurveTo(width * 0.25, height - 90, width * 0.5, height - 48);
    ctx.quadraticCurveTo(width * 0.75, height - 96, width, height - 48);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fill();

    ctx.fillStyle = '#69bf64';
    ctx.fillRect(0, height - 32, width, 32);
    ctx.fillStyle = '#559d51';
    ctx.fillRect(0, height - 28, width, 12);

    ctx.fillStyle = '#3faa4b';
    ctx.strokeStyle = '#2c7d38';
    ctx.lineWidth = 4;
    for (const pipe of this.pipes) {
      const gapTop = pipe.gapY - (gapSize / 2);
      const gapBottom = pipe.gapY + (gapSize / 2);

      ctx.beginPath();
      ctx.rect(pipe.x, 0, pipeWidth, gapTop);
      ctx.rect(pipe.x, gapBottom, pipeWidth, height - gapBottom - 32);
      ctx.fill();
      ctx.stroke();
    }

    this.drawBird();
  }

  drawBird() {
    const ctx = this.ctx;
    const { radius, x, y, velocity } = this.bird;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.max(-0.45, Math.min(0.55, velocity / 10)));

    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.1, radius * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef476f';
    ctx.beginPath();
    ctx.ellipse(-radius * 0.55, 0, radius * 0.7, radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#073b4c';
    ctx.beginPath();
    ctx.arc(radius * 0.3, -radius * 0.25, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();

    const avatar = this.avatar || '🙂';
    ctx.font = `${Math.floor(radius * 1.3)}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatar, 0, 0);

    ctx.restore();
  }
}
