type Params = Record<string, number | string | boolean>

export function renderPattern(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Params,
  t: number,
) {
  const type = p.type as string
  const bg = p.colorA as string
  const fg = p.colorB as string
  const count = Math.max(1, p.scale as number) // cells across width
  const angle = ((p.angle as number) * Math.PI) / 180
  const speed = p.speed as number

  const cell = w / count
  const offset = (((t * speed * cell) % cell) + cell) % cell

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = fg
  ctx.strokeStyle = fg

  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(angle)
  ctx.translate(-w / 2, -h / 2)

  // Draw across an oversized area so rotation still fills the corners.
  const x0 = -w
  const x1 = 2 * w
  const y0 = -h
  const y1 = 2 * h

  switch (type) {
    case 'stripes': {
      const bw = cell / 2
      for (let x = x0 + offset; x < x1; x += cell) {
        ctx.fillRect(x, y0, bw, y1 - y0)
      }
      break
    }
    case 'dots': {
      const r = cell * 0.28
      for (let y = y0 + offset; y < y1; y += cell) {
        for (let x = x0 + offset; x < x1; x += cell) {
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    }
    case 'grid': {
      const lw = Math.max(1, cell * 0.06)
      ctx.lineWidth = lw
      ctx.beginPath()
      for (let x = x0 + offset; x < x1; x += cell) {
        ctx.moveTo(x, y0)
        ctx.lineTo(x, y1)
      }
      for (let y = y0 + offset; y < y1; y += cell) {
        ctx.moveTo(x0, y)
        ctx.lineTo(x1, y)
      }
      ctx.stroke()
      break
    }
    case 'checker': {
      for (let y = y0; y < y1; y += cell) {
        for (let x = x0 + offset; x < x1; x += cell) {
          const col = Math.floor((x - x0) / cell)
          const row = Math.floor((y - y0) / cell)
          if ((col + row) % 2 === 0) ctx.fillRect(x, y, cell, cell)
        }
      }
      break
    }
    case 'waves': {
      const amp = cell
      const lw = Math.max(1, cell * 0.12)
      ctx.lineWidth = lw
      for (let y = y0; y < y1; y += cell) {
        ctx.beginPath()
        for (let x = x0; x <= x1; x += 4) {
          const yy = y + Math.sin((x / cell) * Math.PI * 2 + t * speed) * amp * 0.4
          if (x === x0) ctx.moveTo(x, yy)
          else ctx.lineTo(x, yy)
        }
        ctx.stroke()
      }
      break
    }
  }
  ctx.restore()
}
