const PIPE_SEQUENCE = [
  220,
  170,
  250,
  200,
  140,
  260,
  185,
  235
];

const DEFAULT_OPTIONS = Object.freeze({
  width: 340,
  height: 420,
  gapSize: 140,
  pipeWidth: 60,
  pipeSpacing: 190,
  gravity: 0.3,
  flapStrength: -6.5,
  maxFallSpeed: 12,
  baseSpeed: 2.4
});

export class MiniFlappyGame {
  constructor({ container, getAvatar }) {
    this.container = container;
    this.getAvatar = getAvatar;
    this.options = { ...DEFAULT_OPTIONS };

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.className = 'flappy-canvas';
    this.ctx = this.canvas.getContext('2d');

    this.playfield = document.createElement('div');
    this.playfield.className = 'flappy-playfield';

    this.overlay = document.createElement('div');
    this.overlay.className = 'flappy-overlay';
    this.overlay.textContent = 'Tap or press space to flap';

    this.scoreEl = document.createElement('div');
    this.scoreEl.className = 'flappy-score';
    this.scoreEl.textContent = 'Score: 0';

    this.container.classList.add('flappy-wrapper');
    this.container.appendChild(this.scoreEl);
    this.playfield.appendChild(this.canvas);
    this.playfield.appendChild(this.overlay);
    this.container.appendChild(this.playfield);

    this.boundLoop = this.loop.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handlePointer = this.handlePointer.bind(this);

    this.resetGame();
  }

  setAvatar(avatar) {
    this.avatar = avatar;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = null;
    this.frameHandle = requestAnimationFrame(this.boundLoop);
    window.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('pointerdown', this.handlePointer);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.frameHandle) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.lastTimestamp = null;
    window.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('pointerdown', this.handlePointer);
    this.resetGame();
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
    if (!this.gameActive) {
      this.gameActive = true;
      this.overlay.classList.add('hidden');
    }
    this.bird.velocity = this.options.flapStrength;
  }

  resetGame() {
    const { width, height, pipeSpacing, pipeWidth } = this.options;

    this.pipeCursor = 0;
    this.pipes = [];
    const initialX = width + 40;
    for (let i = 0; i < 4; i += 1) {
      const gapY = PIPE_SEQUENCE[(this.pipeCursor + i) % PIPE_SEQUENCE.length];
      this.pipes.push({
        x: initialX + i * pipeSpacing,
        gapY,
        passed: false
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
    this.gameActive = false;
    this.overlay.classList.remove('hidden');
    this.overlay.textContent = 'Tap or press space to flap';

    this.avatar = this.getAvatar?.() ?? '🙂';

    // Pre-render static gradient background
    this.backgroundGradient = null;
    this.drawFrame();
  }

  loop(timestamp) {
    if (!this.running) return;

    if (this.lastTimestamp == null) {
      this.lastTimestamp = timestamp;
    }

    const delta = Math.min((timestamp - this.lastTimestamp) / (1000 / 60), 1.5);
    this.lastTimestamp = timestamp;

    if (this.gameActive) {
      this.update(delta);
    }

    this.drawFrame();
    this.frameHandle = requestAnimationFrame(this.boundLoop);
  }

  update(delta) {
    const { gravity, maxFallSpeed, baseSpeed, gapSize, pipeWidth, pipeSpacing } = this.options;

    this.bird.velocity = Math.min(this.bird.velocity + gravity * delta, maxFallSpeed);
    this.bird.y += this.bird.velocity * delta * 1.5;

    for (const pipe of this.pipes) {
      pipe.x -= baseSpeed * delta * 2.2;
      const offScreen = pipe.x + pipeWidth < -40;
      if (offScreen) {
        this.pipeCursor = (this.pipeCursor + 1) % PIPE_SEQUENCE.length;
        const lastPipe = this.pipes.reduce((max, current) => (current !== pipe && current.x > max.x ? current : max), { x: -Infinity });
        const referenceX = lastPipe.x === -Infinity ? this.options.width : lastPipe.x;
        pipe.x = referenceX + pipeSpacing;
        pipe.gapY = PIPE_SEQUENCE[this.pipeCursor];
        pipe.passed = false;
      }

      const passed = !pipe.passed && pipe.x + pipeWidth < this.bird.x - this.bird.radius;
      if (passed) {
        pipe.passed = true;
        this.score += 1;
        this.scoreEl.textContent = `Score: ${this.score}`;
      }
    }

    const floor = this.options.height - 40;
    const ceiling = 20;

    if (this.bird.y + this.bird.radius >= floor || this.bird.y - this.bird.radius <= ceiling) {
      this.triggerGameOver();
      return;
    }

    for (const pipe of this.pipes) {
      const top = pipe.gapY - gapSize / 2;
      const bottom = pipe.gapY + gapSize / 2;
      const withinX = this.bird.x + this.bird.radius > pipe.x && this.bird.x - this.bird.radius < pipe.x + pipeWidth;
      if (withinX && (this.bird.y - this.bird.radius < top || this.bird.y + this.bird.radius > bottom)) {
        this.triggerGameOver();
        return;
      }
    }
  }

  triggerGameOver() {
    this.gameActive = false;
    this.overlay.classList.remove('hidden');
    this.overlay.textContent = 'Crash! Tap to try again';
    this.bird.velocity = 0;
  }

  drawFrame() {
    const { width, height, gapSize, pipeWidth } = this.options;
    const ctx = this.ctx;

    if (!this.backgroundGradient) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#6ec3ff');
      gradient.addColorStop(1, '#cdeefd');
      this.backgroundGradient = gradient;
    }

    ctx.fillStyle = this.backgroundGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw distant hills
    ctx.fillStyle = '#9ed18f';
    ctx.beginPath();
    ctx.moveTo(0, height - 40);
    ctx.quadraticCurveTo(width * 0.25, height - 80, width * 0.5, height - 40);
    ctx.quadraticCurveTo(width * 0.75, height - 100, width, height - 40);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fill();

    ctx.fillStyle = '#6fbe63';
    ctx.fillRect(0, height - 32, width, 32);

    ctx.fillStyle = '#5ca84d';
    ctx.fillRect(0, height - 28, width, 12);

    // Draw pipes
    ctx.fillStyle = '#3fa34d';
    ctx.strokeStyle = '#2b7d35';
    ctx.lineWidth = 4;
    for (const pipe of this.pipes) {
      const topBottom = pipe.gapY - gapSize / 2;
      const bottomTop = pipe.gapY + gapSize / 2;

      ctx.beginPath();
      ctx.rect(pipe.x, 0, pipeWidth, topBottom);
      ctx.rect(pipe.x, bottomTop, pipeWidth, height - bottomTop - 32);
      ctx.fill();
      ctx.stroke();
    }

    // Draw bird
    this.drawBird(ctx);
  }

  drawBird(ctx) {
    const { radius } = this.bird;
    ctx.save();
    ctx.translate(this.bird.x, this.bird.y);
    ctx.rotate(Math.max(-0.6, Math.min(0.6, this.bird.velocity / 10)));

    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.1, radius, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef476f';
    ctx.beginPath();
    ctx.ellipse(-radius * 0.6, 0, radius * 0.7, radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#073b4c';
    ctx.beginPath();
    ctx.arc(radius * 0.3, -radius * 0.2, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();

    if (this.avatar) {
      ctx.font = `${Math.floor(radius * 1.3)}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.avatar, 0, 0);
    }

    ctx.restore();
  }
}
