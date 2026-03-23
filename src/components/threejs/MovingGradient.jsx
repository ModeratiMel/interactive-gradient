import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame, useThree } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import { useControls } from 'leva'

// ─── Frequency/phase tables ───────────────────────────────────────────────────
const BLOB_FREQS = [
  [0.37, 0.19, 0.29, 0.11, 0.00, 1.10],
  [0.23, 0.41, 0.17, 0.31, 2.30, 0.70],
  [0.51, 0.13, 0.43, 0.22, 4.70, 3.20],
  [0.31, 0.53, 0.47, 0.16, 1.80, 5.40],
  [0.44, 0.27, 0.38, 0.52, 3.60, 2.10],
  [0.28, 0.44, 0.35, 0.18, 1.50, 5.10],
  [0.19, 0.33, 0.52, 0.27, 6.20, 2.40],
  [0.41, 0.22, 0.26, 0.48, 4.10, 0.90],
]

const MAX_BLOBS = 8

function lissajous(t, fx1, fx2, fy1, fy2, px, py, randomness, margin = 0.06) {
  const range = 0.5 - margin
  const amp1  = 0.5 + randomness * 0.5
  const amp2  = 0.1 + randomness * 0.35
  const x = 0.5 + Math.sin(t * fx1 + px) * range * amp1 + Math.sin(t * fx2 * (1 + randomness * 0.8)) * range * amp2
  const y = 0.5 + Math.cos(t * fy1 + py) * range * amp1 + Math.cos(t * fy2 * (1 + randomness * 0.8)) * range * amp2
  return [x, y]
}

// ─── TouchTexture ─────────────────────────────────────────────────────────────
// Paints mouse trail onto a canvas texture.
// R = velocity X, G = velocity Y, B = intensity — sampled as a distortion map.
class TouchTexture {
  constructor(size = 64) {
    this.size   = size
    this.maxAge = 80
    this.radius = size * 0.22
    this.trail  = []
    this.last   = null

    this.canvas       = document.createElement('canvas')
    this.canvas.width = this.canvas.height = size
    this.ctx          = this.canvas.getContext('2d')
    this.ctx.fillStyle = 'black'
    this.ctx.fillRect(0, 0, size, size)

    this.texture            = new THREE.CanvasTexture(this.canvas)
    this.texture.needsUpdate = true
  }

  addTouch(x, y) {
    let vx = 0, vy = 0, force = 0
    if (this.last) {
      const dx = x - this.last.x
      const dy = y - this.last.y
      if (dx === 0 && dy === 0) return
      const d = Math.sqrt(dx * dx + dy * dy)
      vx    = dx / d
      vy    = dy / d
      force = Math.min((dx * dx + dy * dy) * 20000, 2.0)
    }
    this.last = { x, y }
    this.trail.push({ x, y, age: 0, force, vx, vy })
  }

  update() {
    // Clear to black
    this.ctx.fillStyle = 'black'
    this.ctx.fillRect(0, 0, this.size, this.size)

    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i]
      const progress = p.age / this.maxAge

      // Eased intensity: ramp up then ramp down
      let intensity
      if (p.age < this.maxAge * 0.3) {
        intensity = Math.sin((p.age / (this.maxAge * 0.3)) * (Math.PI / 2))
      } else {
        const t = 1 - (p.age - this.maxAge * 0.3) / (this.maxAge * 0.7)
        intensity = t * (2 - t) // ease out quad
      }
      intensity *= p.force

      // Drift point along its velocity
      p.x += p.vx * 0.002 * (1 - progress)
      p.y += p.vy * 0.002 * (1 - progress)
      p.age++

      if (p.age > this.maxAge) {
        this.trail.splice(i, 1)
        continue
      }

      const px  = p.x * this.size
      const py  = (1 - p.y) * this.size
      const r   = this.radius

      // Encode velocity direction in RG, intensity in B (via shadow trick)
      const colorR = Math.round(((p.vx + 1) / 2) * 255)
      const colorG = Math.round(((p.vy + 1) / 2) * 255)
      const colorB = Math.round(intensity * 255)

      const offset = this.size * 5
      this.ctx.shadowOffsetX = offset
      this.ctx.shadowOffsetY = offset
      this.ctx.shadowBlur    = r
      this.ctx.shadowColor   = `rgba(${colorR},${colorG},${colorB},${0.2 * intensity})`
      this.ctx.beginPath()
      this.ctx.fillStyle = 'rgba(255,0,0,1)'
      this.ctx.arc(px - offset, py - offset, r, 0, Math.PI * 2)
      this.ctx.fill()
    }

    this.texture.needsUpdate = true
  }
}

// ─── Fragment shader ──────────────────────────────────────────────────────────
const fragmentShader = /* glsl */`
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform float uSpeed;
uniform float uGrainIntensity;
uniform float uBlobRadius;
uniform float uIntensity;
uniform float uSaturation;
uniform float uMouseDistort;
uniform sampler2D uTouchTexture;

// Base color shown where no blobs reach
uniform vec3  uBaseColor;

// Up to 8 blobs, each with position + color
uniform vec2  uPos0; uniform vec3  uCol0;
uniform vec2  uPos1; uniform vec3  uCol1;
uniform vec2  uPos2; uniform vec3  uCol2;
uniform vec2  uPos3; uniform vec3  uCol3;
uniform vec2  uPos4; uniform vec3  uCol4;
uniform vec2  uPos5; uniform vec3  uCol5;
uniform vec2  uPos6; uniform vec3  uCol6;
uniform vec2  uPos7; uniform vec3  uCol7;

float grain(vec2 uv, float t) {
  vec2 p = uv * uResolution * 0.5;
  return fract(sin(dot(p + t, vec2(12.9898, 78.233))) * 43758.5453) * 2.0 - 1.0;
}

// Smooth radial influence: 1 at center, 0 at radius edge
float blobInfluence(vec2 uv, vec2 center, float radius) {
  float d = length(uv - center);
  return 1.0 - smoothstep(0.0, radius, d);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // ── Touch distortion ──────────────────────────────────────────────
  vec4 touch   = texture2D(uTouchTexture, uv);
  float tvx    = -(touch.r * 2.0 - 1.0);
  float tvy    = -(touch.g * 2.0 - 1.0);
  float tIntens = touch.b;
  uv.x += tvx * uMouseDistort * tIntens;
  uv.y += tvy * uMouseDistort * tIntens;

  // Ripple from touch center
  vec2  tc     = vec2(0.5);
  float tdist  = length(uv - tc);
  float ripple = sin(tdist * 22.0 - uTime * 3.0) * 0.025 * tIntens;
  uv += vec2(ripple);

  // ── Additive color blobs ──────────────────────────────────────────
  // Each blob contributes its color weighted by its influence.
  // They add together additively — where blobs overlap colors mix like light.
  float r = uBlobRadius;
  vec3  color = vec3(0.0);

  color += uCol0 * blobInfluence(uv, uPos0, r * 1.00);
  color += uCol1 * blobInfluence(uv, uPos1, r * 0.95);
  color += uCol2 * blobInfluence(uv, uPos2, r * 0.90);
  color += uCol3 * blobInfluence(uv, uPos3, r * 0.88);
  color += uCol4 * blobInfluence(uv, uPos4, r * 0.85);
  color += uCol5 * blobInfluence(uv, uPos5, r * 0.82);
  color += uCol6 * blobInfluence(uv, uPos6, r * 0.80);
  color += uCol7 * blobInfluence(uv, uPos7, r * 0.78);

  // Scale and clamp
  color = clamp(color * uIntensity, 0.0, 1.0);

  // ── Saturation boost ─────────────────────────────────────────────
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(lum), color, uSaturation);

  // ── Slight gamma curve for contrast ──────────────────────────────
  color = pow(clamp(color, 0.0, 1.0), vec3(0.92));

  // ── Base color in dark areas ──────────────────────────────────────
  // Where blobs don't reach, blend in the base color instead of black
  float brightness = length(color);
  float baseMix    = max(brightness * 1.2, 0.15);
  color = mix(uBaseColor, color, min(baseMix, 1.0));

  // ── Time-based subtle hue shift ───────────────────────────────────
  float ts = uTime * 0.4;
  color.r += sin(ts)        * 0.018;
  color.g += cos(ts * 1.4)  * 0.018;
  color.b += sin(ts * 1.2)  * 0.018;

  // ── Grain ─────────────────────────────────────────────────────────
  color += grain(uv, uTime) * uGrainIntensity;

  color = clamp(color, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);
}
`

const vertexShader = /* glsl */`
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

// ─── shaderMaterial ───────────────────────────────────────────────────────────
const GradientMaterial = shaderMaterial(
  {
    uTime:          0,
    uResolution:    new THREE.Vector2(1, 1),
    uSpeed:         1.2,
    uGrainIntensity: 0.05,
    uBlobRadius:    0.55,
    uIntensity:     1.6,
    uSaturation:    1.3,
    uMouseDistort:  0.18,
    uTouchTexture:  null,
    uBaseColor:     new THREE.Color('#000000'),
    // blob positions + colors
    uPos0: new THREE.Vector2(0.5, 0.5), uCol0: new THREE.Color('#f15a22'),
    uPos1: new THREE.Vector2(0.5, 0.5), uCol1: new THREE.Color('#0a0e27'),
    uPos2: new THREE.Vector2(0.5, 0.5), uCol2: new THREE.Color('#f15a22'),
    uPos3: new THREE.Vector2(0.5, 0.5), uCol3: new THREE.Color('#0a0e27'),
    uPos4: new THREE.Vector2(0.5, 0.5), uCol4: new THREE.Color('#f15a22'),
    uPos5: new THREE.Vector2(0.5, 0.5), uCol5: new THREE.Color('#0a0e27'),
    uPos6: new THREE.Vector2(0.5, 0.5), uCol6: new THREE.Color('#f15a22'),
    uPos7: new THREE.Vector2(0.5, 0.5), uCol7: new THREE.Color('#0a0e27'),
  },
  vertexShader,
  fragmentShader
)

extend({ GradientMaterial })

// ─── Component ────────────────────────────────────────────────────────────────
export default function SmoothGradient({ mousePosition }) {
  const mat              = useRef()
  const touch            = useMemo(() => new TouchTexture(64), [])
  const { size, viewport } = useThree()

  // Motion
  const { speed, randomness, numBlobs } = useControls('Motion', {
    speed:      { value: 1.2,  min: 0.1, max: 4.0,      step: 0.05 },
    randomness: { value: 0.6,  min: 0.0, max: 1.0,      step: 0.01 },
    numBlobs:   { value: 6,    min: 2,   max: MAX_BLOBS, step: 1,   label: 'blob count' },
  })

  // Look
  const { grain, blobRadius, intensity, saturation, mouseDistort } = useControls('Look', {
    grain:        { value: 0.05,  min: 0.0,  max: 0.15, step: 0.005 },
    blobRadius:   { value: 0.55,  min: 0.15, max: 1.2,  step: 0.01,  label: 'blob radius' },
    intensity:    { value: 1.6,   min: 0.5,  max: 3.5,  step: 0.05  },
    saturation:   { value: 1.3,   min: 0.0,  max: 2.5,  step: 0.05  },
    mouseDistort: { value: 0.18,  min: 0.0,  max: 0.6,  step: 0.01,  label: 'mouse distort' },
  })

  // Colors — up to 8 blob colors + base
  const colors = useControls('Colors', {
    baseColor: { value: '#000000', label: 'base color' },
    blob0:     { value: '#f1a16d', label: 'blob 1' },
    blob1:     { value: '#000000', label: 'blob 2' },
    blob2:     { value: '#b75b34', label: 'blob 3' },
    blob3:     { value: '#000000', label: 'blob 4' },
    blob4:     { value: '#fe4a20', label: 'blob 5' },
    blob5:     { value: '#000000', label: 'blob 6' },
    blob6:     { value: '#7f0b06', label: 'blob 7' },
    blob7:     { value: '#000000', label: 'blob 8' },
  })

  useFrame(({ clock }) => {
    if (!mat.current) return
    const m = mat.current
    const t = clock.elapsedTime

    // Touch texture update — guard against undefined on first frame
    if (mousePosition?.x != null) {
      touch.addTouch(mousePosition.x, 1.0 - mousePosition.y)
    }
    touch.update()

    // Resolution — fall back to window dimensions if prop not yet available
    // R3F size is already in physical pixels (accounts for DPR internally),
    // but we want actual device pixels for gl_FragCoord to match.
    // viewport.dpr is the capped pixel ratio R3F uses for the renderer.
    m.uResolution.set(size.width * viewport.dpr, size.height * viewport.dpr)
    m.uTime           = t
    m.uSpeed          = speed
    m.uGrainIntensity = grain
    m.uBlobRadius     = blobRadius
    m.uIntensity      = intensity
    m.uSaturation     = saturation
    m.uMouseDistort   = mouseDistort
    m.uTouchTexture   = touch.texture

    m.uBaseColor.set(colors.baseColor)

    // Blob colors
    const blobColorKeys = ['blob0','blob1','blob2','blob3','blob4','blob5','blob6','blob7']
    blobColorKeys.forEach((key, i) => {
      m[`uCol${i}`].set(colors[key])
    })

    // Blob positions — lissajous paths, inactive ones parked off-screen
    const ts = t * speed * 0.28  // slower than reference for lava-lamp feel
    for (let i = 0; i < MAX_BLOBS; i++) {
      if (i < numBlobs) {
        const [fx1, fx2, fy1, fy2, px, py] = BLOB_FREQS[i]
        const [x, y] = lissajous(ts, fx1, fx2, fy1, fy2, px, py, randomness)
        m[`uPos${i}`].set(x, y)
      } else {
        m[`uPos${i}`].set(-9, -9)
      }
    }
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <gradientMaterial ref={mat} depthWrite={false} />
    </mesh>
  )
}