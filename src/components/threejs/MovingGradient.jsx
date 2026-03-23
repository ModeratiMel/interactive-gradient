import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame, useThree } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import { useControls } from 'leva'

// ─── Fluid simulation ────────────────────────────────────────────────────────
// Pure-JS pressure/velocity grid. All inputs/outputs stay in normalised space
// (cursor deltas as fractions of canvas width/height) so packing into the
// velocity texture is stable regardless of canvas pixel size.

function createFluidGrid(cols, rows) {
  const n        = cols * rows
  const xv       = new Float32Array(n)
  const yv       = new Float32Array(n)
  const pressure = new Float32Array(n)

  // Toroidal wrap — pressure propagates cleanly across all edges
  function idx(c, r) {
    return ((c % cols + cols) % cols) + ((r % rows + rows) % rows) * cols
  }

  // cx, cy  — normalised cursor position [0,1]
  // dvx/dvy — cursor delta in normalised units (Δx/width, Δy/height) this frame
  // pen     — influence radius as fraction of width [0,1]
  // force   — scalar multiplier
  function addVelocity(cx, cy, dvx, dvy, pen, force) {
    const gc  = cx * cols
    const gr  = cy * rows
    const gp  = pen * cols   // pen radius in grid cells
    const gp2 = gp * gp
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const dx = c - gc
        const dy = r - gr
        const d2 = dx * dx + dy * dy
        if (d2 < gp2) {
          const falloff = 1.0 - Math.sqrt(d2) / gp   // linear, 1 at centre → 0 at edge
          xv[idx(c, r)] += dvx * falloff * force
          yv[idx(c, r)] += dvy * falloff * force
        }
      }
    }
  }

  function step(viscosity) {
    // Pressure from velocity divergence
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const i  = idx(c, r)
        const px = (
            xv[idx(c - 1, r - 1)] * 0.5
          + xv[idx(c - 1, r    )]
          + xv[idx(c - 1, r + 1)] * 0.5
          - xv[idx(c + 1, r - 1)] * 0.5
          - xv[idx(c + 1, r    )]
          - xv[idx(c + 1, r + 1)] * 0.5
        )
        const py = (
            yv[idx(c - 1, r - 1)] * 0.5
          + yv[idx(c,     r - 1)]
          + yv[idx(c + 1, r - 1)] * 0.5
          - yv[idx(c - 1, r + 1)] * 0.5
          - yv[idx(c,     r + 1)]
          - yv[idx(c + 1, r + 1)] * 0.5
        )
        pressure[i] = (px + py) * 0.25
      }
    }
    // Velocity from pressure gradient
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const i  = idx(c, r)
        xv[i] += (
            pressure[idx(c - 1, r - 1)] * 0.5
          + pressure[idx(c - 1, r    )]
          + pressure[idx(c - 1, r + 1)] * 0.5
          - pressure[idx(c + 1, r - 1)] * 0.5
          - pressure[idx(c + 1, r    )]
          - pressure[idx(c + 1, r + 1)] * 0.5
        ) * 0.25
        yv[i] += (
            pressure[idx(c - 1, r - 1)] * 0.5
          + pressure[idx(c,     r - 1)]
          + pressure[idx(c + 1, r - 1)] * 0.5
          - pressure[idx(c - 1, r + 1)] * 0.5
          - pressure[idx(c,     r + 1)]
          - pressure[idx(c + 1, r + 1)] * 0.5
        ) * 0.25
        xv[i] *= viscosity
        yv[i] *= viscosity
      }
    }
  }

  return { addVelocity, step, xv, yv }
}

// ─── Shaders ─────────────────────────────────────────────────────────────────

const vertexShader = `void main() { gl_Position = vec4(position, 1.0); }`

const fragmentShader = /* glsl */`
precision highp float;

uniform float     uTime;
uniform vec2      uResolution;
uniform float     uDriftSpeed;
uniform float     uDriftAmt;
uniform float     uAdvectStrength;
uniform float     uGrain;
uniform float     uGrainSize;
uniform float     uGrainSpeed;
uniform float     uDPR;
uniform sampler2D uVelocityTex;

uniform vec3 uCol0;
uniform vec3 uCol1;
uniform vec3 uCol2;
uniform vec3 uCol3;
uniform vec3 uCol4;
uniform vec3 uCol5;
uniform vec3 uCol6;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += noise(p) * a;
    p  = p * 2.07 + vec2(1.3, 0.9);
    a *= 0.5;
  }
  return v;
}

// Two-gaussian heat model.
// A broad outer bloom fills the upper-left arc; a tight core creates the
// peach hotspot. Both fall off to true black well before x=1 or y=1,
// so clamping the lookup UV causes zero visible artefacts.
float baseHeat(vec2 uv, float t) {
  float ox = sin(t * 0.13) * 0.05 + cos(t * 0.07) * 0.03;
  float oy = cos(t * 0.11) * 0.04 + sin(t * 0.09) * 0.03;
  vec2 src = vec2(0.18 + ox, 0.22 + oy);

  // Aspect-correct so the bloom is circular in screen space
  float aspect = uResolution.x / uResolution.y;
  vec2  d      = vec2((uv.x - src.x) * aspect, uv.y - src.y);
  float dist   = length(d);

  float bloom = exp(-dist * dist * 1.6) * 0.50;  // wide soft arc
  float core  = exp(-dist * dist * 7.0) * 0.85;  // tight bright centre
  return bloom + core;
}

// Ramp tuned so most of the canvas stays in the very-dark-crimson range,
// with the bright warm tones only appearing close to the heat source.
// Stops match the reference image proportions.
vec3 colorRamp(float h) {
  h = clamp(h, 0.0, 1.0);
  if (h < 0.28) return mix(uCol0, uCol1, h / 0.28);
  if (h < 0.50) return mix(uCol1, uCol2, (h - 0.28) / 0.22);
  if (h < 0.64) return mix(uCol2, uCol3, (h - 0.50) / 0.14);
  if (h < 0.76) return mix(uCol3, uCol4, (h - 0.64) / 0.12);
  if (h < 0.87) return mix(uCol4, uCol5, (h - 0.76) / 0.11);
               return mix(uCol5, uCol6, (h - 0.87) / 0.13);
}

void main() {
  vec2  uv = gl_FragCoord.xy / uResolution;   // [0,1], y=0 bottom-left
  float t  = uTime * uDriftSpeed;

  // Organic FBM warp keeps the gradient feeling alive
  vec2 wc   = uv * 1.8 + vec2(t * 0.08, t * 0.06);
  vec2 warp = vec2(fbm(wc) - 0.5, fbm(wc + vec2(3.7, 2.1)) - 0.5) * uDriftAmt;

  // Velocity texture was uploaded with y=0 at top (matches mousePosition),
  // so flip Y when sampling to align with shader UV (y=0 at bottom).
  vec2 tuv = vec2(uv.x, 1.0 - uv.y);
  vec2 vel = (texture2D(uVelocityTex, tuv).rg - 0.5) * 2.0;

  // Clamp lookup UV — prevents any seam discontinuity at edges.
  // The gradient is fully black at the edges so clamping is invisible.
  vec2 lookupUV = clamp(uv + warp - vel * uAdvectStrength, 0.001, 0.999);

  float heat  = baseHeat(lookupUV, t);
  vec3  color = colorRamp(heat);

  // Temporally dithered film grain
  float gTime  = uTime * uGrainSpeed;
  float gf     = floor(gTime);
  float gfrac  = fract(gTime);
  vec2  gUV    = floor(uv * uResolution / (uGrainSize * uDPR))
               / (uResolution / (uGrainSize * uDPR));
  vec2  offA   = vec2(hash(vec2(gf,       0.0)), hash(vec2(0.0, gf      ))) * 100.0;
  vec2  offB   = vec2(hash(vec2(gf + 1.0, 0.0)), hash(vec2(0.0, gf + 1.0))) * 100.0;
  float gr     = mix(hash(gUV + offA) - 0.5, hash(gUV + offB) - 0.5, gfrac) * uGrain;

  gl_FragColor = vec4(clamp(color + gr, 0.0, 1.0), 1.0);
}
`

// ─── Component ───────────────────────────────────────────────────────────────
export default function MovingGradient({ mousePosition }) {
  const mat      = useRef()
  const { size } = useThree()

  const FLUID_COLS = 72
  const FLUID_ROWS = 54
  const fluid      = useRef(null)
  const velTex     = useRef(null)
  const velBuf     = useRef(new Float32Array(FLUID_COLS * FLUID_ROWS * 4))
  const prevMouse  = useRef({ x: mousePosition.x, y: mousePosition.y })

  if (!fluid.current) {
    fluid.current = createFluidGrid(FLUID_COLS, FLUID_ROWS)
  }

  // ── Leva controls ──────────────────────────────────────────────────────────
  const { driftSpeed, driftAmt, advectStrength, penSize, viscosity, forceScale } = useControls('Motion', {
    driftSpeed:     { value: 0.5,   min: 0.05, max: 2.0,  step: 0.05, label: 'drift speed'   },
    driftAmt:       { value: 0.05,  min: 0.0,  max: 0.15, step: 0.005,label: 'warp amount'   },
    advectStrength: { value: 0.10,  min: 0.0,  max: 0.40, step: 0.01, label: 'trail depth'   },
    penSize:        { value: 0.12,  min: 0.03, max: 0.35, step: 0.01, label: 'cursor radius' },
    viscosity:      { value: 0.982, min: 0.90, max: 0.999,step: 0.001,label: 'viscosity'     },
    forceScale:     { value: 18.0,  min: 1.0,  max: 60.0, step: 1.0,  label: 'force'         },
  })

  const { grain, grainSize, grainSpeed } = useControls('Grain', {
    grain:      { value: 0.038, min: 0.0, max: 0.10, step: 0.002              },
    grainSize:  { value: 3.0,   min: 1.0, max: 10.0, step: 1.0                },
    grainSpeed: { value: 2.0,   min: 1.0, max: 15.0, step: 1.0, label: 'grain speed' },
  })

  const { col0, col1, col2, col3, col4, col5, col6 } = useControls('Colors', {
    col0: { value: '#000000', label: 'void'         },
    col1: { value: '#150100', label: 'near-black'   },
    col2: { value: '#450600', label: 'deep crimson' },
    col3: { value: '#7a0e00', label: 'dark red'     },
    col4: { value: '#b82c0e', label: 'red-orange'   },
    col5: { value: '#cc5535', label: 'warm orange'  },
    col6: { value: '#e09070', label: 'peach peak'   },
  })

  // ── Velocity DataTexture — created once ────────────────────────────────────
  useEffect(() => {
    const tex = new THREE.DataTexture(
      velBuf.current,
      FLUID_COLS,
      FLUID_ROWS,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS     = THREE.ClampToEdgeWrapping
    tex.wrapT     = THREE.ClampToEdgeWrapping
    velTex.current = tex
    return () => tex.dispose()
  }, [])

  // ── shaderMaterial ─────────────────────────────────────────────────────────
  const GradientMaterial = shaderMaterial(
    {
      uTime:           0,
      uResolution:     new THREE.Vector2(1, 1),
      uDriftSpeed:     driftSpeed,
      uDriftAmt:       driftAmt,
      uAdvectStrength: advectStrength,
      uGrain:          grain,
      uGrainSize:      grainSize,
      uGrainSpeed:     grainSpeed,
      uDPR:            1.0,
      uVelocityTex:    null,
      uCol0:           new THREE.Color(col0),
      uCol1:           new THREE.Color(col1),
      uCol2:           new THREE.Color(col2),
      uCol3:           new THREE.Color(col3),
      uCol4:           new THREE.Color(col4),
      uCol5:           new THREE.Color(col5),
      uCol6:           new THREE.Color(col6),
    },
    vertexShader,
    fragmentShader
  )

  extend({ GradientMaterial })

  // ── Per-frame ──────────────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    if (!mat.current || !velTex.current) return
    const m   = mat.current
    const dpr = window.devicePixelRatio || 1

    m.uResolution.set(size.width * dpr, size.height * dpr)
    m.uTime           = clock.elapsedTime
    m.uDriftSpeed     = driftSpeed
    m.uDriftAmt       = driftAmt
    m.uAdvectStrength = advectStrength
    m.uGrain          = grain
    m.uGrainSize      = grainSize
    m.uGrainSpeed     = grainSpeed
    m.uDPR            = dpr

    m.uCol0.set(col0)
    m.uCol1.set(col1)
    m.uCol2.set(col2)
    m.uCol3.set(col3)
    m.uCol4.set(col4)
    m.uCol5.set(col5)
    m.uCol6.set(col6)

    // ── fluid ──
    // mousePosition: { x, y } in [0,1], y=0 at top
    const mx  = mousePosition.x
    const my  = mousePosition.y
    const pmx = prevMouse.current.x
    const pmy = prevMouse.current.y

    // Deltas in normalised units — independent of canvas pixel dimensions
    const dvx = mx - pmx
    const dvy = my - pmy

    fluid.current.addVelocity(mx, my, dvx, dvy, penSize, forceScale)
    fluid.current.step(viscosity)

    // Pack into float texture.
    // Typical delta magnitude is ~0.005–0.02/frame; VMAX=0.04 captures peak moves
    // without clipping slow drags, giving a clean [-1,1] → [0,1] mapping.
    const { xv, yv } = fluid.current
    const buf         = velBuf.current
    const VMAX        = 0.04
    for (let i = 0; i < FLUID_COLS * FLUID_ROWS; i++) {
      buf[i * 4 + 0] = Math.max(-1, Math.min(1, xv[i] / VMAX)) * 0.5 + 0.5
      buf[i * 4 + 1] = Math.max(-1, Math.min(1, yv[i] / VMAX)) * 0.5 + 0.5
      buf[i * 4 + 2] = 0.0
      buf[i * 4 + 3] = 1.0
    }
    velTex.current.needsUpdate = true
    m.uVelocityTex = velTex.current

    prevMouse.current = { x: mx, y: my }
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <gradientMaterial ref={mat} depthWrite={false} />
    </mesh>
  )
}