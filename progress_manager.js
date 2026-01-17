// ======================================================================
// FILE PATH: progress_manager.js
// ======================================================================

export const ProgressManager = {
  instances: {},
  DOT_SIZE: 2, // Tiny squares
  GAP: 1, // Tight gap

  // Visual Configuration
  COLOR_FILL: "rgba(6, 182, 212, 1.0)", // Solid Cyan for 100%
  COLOR_DOTS: "rgba(6, 182, 212, 0.5)", // Cyan dots
  LERP_FACTOR: 0.08, // Lower = Smoother, heavier feel (0.05 - 0.1 range)

  init(id, canvas, targetProgress) {
    if (!canvas) return;

    // Create or update instance
    if (!this.instances[id] || this.instances[id].canvas !== canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      // Ensure crisp rendering on high DPI
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // Grid Calculation
      const totalSize = this.DOT_SIZE + this.GAP;
      const cols = Math.ceil(rect.width / totalSize);
      const rows = Math.ceil(rect.height / totalSize);
      const totalDots = cols * rows;

      // Fisher-Yates Shuffle for random fill pattern
      const indices = Array.from({ length: totalDots }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }

      this.instances[id] = {
        canvas,
        ctx,
        width: rect.width,
        height: rect.height,
        cols,
        rows,
        totalDots,
        indices,
        current: 0, // Always start animation from 0 or current cached state
        target: targetProgress,
        animationId: null,
      };
    } else {
      // Update target
      this.instances[id].target = targetProgress;
    }

    // Start loop if not running
    if (!this.instances[id].animationId) {
      this.animate(id);
    }
  },

  animate(id) {
    const inst = this.instances[id];
    if (!inst) return;

    // Linear Interpolation: current = current + (target - current) * factor
    const diff = inst.target - inst.current;

    // Stop jittering when very close
    if (Math.abs(diff) < 0.05) {
      inst.current = inst.target;
    } else {
      inst.current += diff * this.LERP_FACTOR;
    }

    this.draw(inst);

    // Stop loop if settled at a key state (0 or 100)
    if (inst.current === inst.target && (inst.target <= 0 || inst.target >= 100)) {
      inst.animationId = null;
      return;
    }

    inst.animationId = requestAnimationFrame(() => this.animate(id));
  },

  draw(inst) {
    const { ctx, width, height, current, indices, cols, totalDots } = inst;

    ctx.clearRect(0, 0, width, height);

    if (current <= 0.1) return;

    // 100% Complete: Solid Fill
    if (current >= 99.9) {
      ctx.fillStyle = this.COLOR_FILL;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    // Dot Drawing
    const dotsToDraw = Math.floor(totalDots * (current / 100));
    const totalSize = this.DOT_SIZE + this.GAP;

    ctx.fillStyle = this.COLOR_DOTS;

    // Batch drawing could be optimized with Path2D for massive grids,
    // but for popup dimensions, direct loop is fast enough.
    ctx.beginPath();
    for (let i = 0; i < dotsToDraw; i++) {
      const idx = indices[i];
      const c = idx % cols;
      const r = Math.floor(idx / cols);

      const x = c * totalSize;
      const y = r * totalSize;

      ctx.rect(x, y, this.DOT_SIZE, this.DOT_SIZE);
    }
    ctx.fill();
  },
};
