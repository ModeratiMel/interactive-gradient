import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame, useThree } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import { useControls } from 'leva'

// ─── Fluid grid ───────────────────────────────────────────────────────────────
// Double-buffered pressure/velocity in fully normalised space.

function createFluidGrid(cols, rows) {
  const n  = cols * rows
  const xv = new Float32Array(n)
  const yv = new Float32Array(n)
  const p0 = new Float32Array(n)
  const p1 = new Float32Array(n)

  function idx(c, r) {
    return ((c % cols + cols) % cols) + ((r % rows + rows) % rows) * cols
  }

  function addVelocity(cx, cy, dvx, dvy, pen, force) {
    const gc  = cx * cols
    const gr  = cy * rows
    const gp  = pen * cols
    const gp2 = gp * gp
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const dx = c - gc
        const dy = r - gr
        const d2 = dx * dx + dy * dy
        if (d2 < gp2) {
          const t       = Math.sqrt(d2) / gp
          const falloff = 0.5 + 0.5 * Math.cos(t * Math.PI) // smooth cosine, no hard edge
          const i       = idx(c, r)
          xv[i] += dvx * falloff * force
          yv[i] += dvy * falloff * force
        }
      }
    }
  }

  function step(viscosity) {
    // Pressure divergence → p1 (reads xv/yv, writes p1 only)
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const px = (
            xv[idx(c-1,r-1)]*0.5 + xv[idx(c-1,r)] + xv[idx(c-1,r+1)]*0.5
          - xv[idx(c+1,r-1)]*0.5 - xv[idx(c+1,r)] - xv[idx(c+1,r+1)]*0.5
        )
        const py = (
            yv[idx(c-1,r-1)]*0.5 + yv[idx(c,r-1)] + yv[idx(c+1,r-1)]*0.5
          - yv[idx(c-1,r+1)]*0.5 - yv[idx(c,r+1)] - yv[idx(c+1,r+1)]*0.5
        )
        p1[idx(c,r)] = (px + py) * 0.25
      }
    }
    // Swap: p1 becomes the read buffer
    p1.forEach((v, i) => { p0[i] = v })

    // Velocity update reads p0 (complete, stable)
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const i = idx(c, r)
        xv[i] += (
            p0[idx(c-1,r-1)]*0.5 + p0[idx(c-1,r)] + p0[idx(c-1,r+1)]*0.5
          - p0[idx(c+1,r-1)]*0.5 - p0[idx(c+1,r)] - p0[idx(c+1,r+1)]*0.5
        ) * 0.25
        yv[i] += (
            p0[idx(c-1,r-1)]*0.5 + p0[idx(c,r-1)] + p0[idx(c+1,r-1)]*0.5
          - p0[idx(c-1,r+1)]*0.5 - p0[idx(c,r+1)] - p0[idx(c+1,r+1)]*0.5
        ) * 0.25
        xv[i] *= viscosity
        yv[i] *= viscosity
      }
    }
  }

  return { addVelocity, step, xv, yv }
}

// ─── Shaders ──────────────────────────────────────────────────────────────────

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

// Color stops extracted from the reference image
uniform vec3 uCol0; // pure black            #000000  — corners / lower-right
uniform vec3 uCol1; // near black crimson    #1c0200  — dark field
uniform vec3 uCol2; // deep crimson          #4a0700  — mid field
uniform vec3 uCol3; // dark red              #7e1000  — inner field
uniform vec3 uCol4; // red-orange            #c03010  — hot zone
uniform vec3 uCol5; // vivid left-edge red   #d94020  — left arc
uniform vec3 uCol6; // warm salmon           #d88060  — upper bloom
uniform vec3 uCol7; // peach highlight       #e8aa80  — peak / hotspot

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p) {
  float v=0.0,a=0.5;
  for(int i=0;i<4;i++){v+=noise(p)*a;p=p*2.07+vec2(1.3,0.9);a*=0.5;}
  return v;
}

// ─── Heat field ───────────────────────────────────────────────────────────────
//
// Adjusted to push more of the light source off-canvas and create steeper falloff
// for 30-50% black coverage with concentrated warm tones matching the reference.

float baseHeat(vec2 uv, float t) {
  // Slower, more subtle drift
  float ox = sin(t * 0.07) * 0.025 + cos(t * 0.05) * 0.018;
  float oy = cos(t * 0.09) * 0.020 + sin(t * 0.06) * 0.012;

  // A) Primary off-canvas source — pushed MUCH further off-canvas
  //    Now at (-0.35, -0.25) with steeper falloff (1.2 instead of 0.55)
  //    This creates the concentrated upper-left warmth while letting
  //    the upper-right fall to deep black naturally
  vec2 sA = vec2(-0.25 + ox, 1.75 + oy);
  float dA  = length(uv - sA);

  float ripple = sin((uv.x + uv.y + t * 0.2) * 3.0) * 0.05;
float breathe = 1.25 + sin(t * 0.15) * 0.15 + ripple;
  float hA = exp(-dA * dA * (0.45 / breathe)) * 0.85;

  // B) Left-edge arc — the vivid red crescent
  //    Moved further left to (-0.18, 0.48) and made slightly more concentrated
  vec2  sB  = vec2(-0.18 + ox * 0.4, 0.48 + oy * 0.8);
  float dB  = length(uv - sB);
  float hB  = exp(-dB * dB * (2.4/ breathe)) * 0.55;  // Tighter, slightly dimmed

  // C) Dark-crimson midfield — reduced strength to let more black through
  vec2  sC  = vec2(0.65 + ox * 0.2, 0.45 + oy * 0.2);
  float dC  = length(uv - sC);
  float hC  = exp(-dC * dC * (2.8/breathe)) * 0.15;  // Much weaker, tighter

  return hA + hB + hC;
}

// ─── Colour ramp ──────────────────────────────────────────────────────────────
// Eight stops. The ramp is calibrated so that the heat values produced by
// baseHeat() (which peak around 1.3+ at UV origin and fall to ~0 at lower-right)
// map to the right colours after clamping to [0,1].
//
// Pixel-area proportions from the reference:
//   black / near-black  ~30%  → stops 0-1, heat 0.00-0.18
//   deep crimson        ~25%  → stops 1-2, heat 0.18-0.38
//   dark red            ~15%  → stops 2-3, heat 0.38-0.54
//   red-orange          ~12%  → stops 3-4, heat 0.54-0.66
//   vivid red (arc)     ~8%   → stops 4-5, heat 0.66-0.76
//   warm salmon         ~6%   → stops 5-6, heat 0.76-0.86
//   peach highlight     ~4%   → stops 6-7, heat 0.86-1.00
vec3 colorRamp(float h) {
  h = clamp(h, 0.0, 1.0);
  if (h < 0.18) return mix(uCol0, uCol1, h / 0.18);
  if (h < 0.38) return mix(uCol1, uCol2, (h - 0.18) / 0.20);
  if (h < 0.54) return mix(uCol2, uCol3, (h - 0.38) / 0.16);
  if (h < 0.66) return mix(uCol3, uCol4, (h - 0.54) / 0.12);
  if (h < 0.76) return mix(uCol4, uCol5, (h - 0.66) / 0.10);
  if (h < 0.86) return mix(uCol5, uCol6, (h - 0.76) / 0.10);
               return mix(uCol6, uCol7, (h - 0.86) / 0.14);
}

void main() {
  vec2  uv = gl_FragCoord.xy / uResolution;
  float t  = uTime * uDriftSpeed;

  // Gentle FBM warp for organic softness on gradient edges
  vec2 wc   = uv * 2.0 + vec2(t * 0.06, t * 0.05);
  vec2 warp = vec2(fbm(wc) - 0.5, fbm(wc + vec2(3.7, 2.1)) - 0.5) * uDriftAmt;

  // Velocity texture: uploaded top-down, flip Y to match GL UV
  vec2 tuv = vec2(uv.x, 1.0 - uv.y);
  vec2 vel = (texture2D(uVelocityTex, tuv).rg - 0.5) * 2.0;

float dir = fbm(vec2(t * 0.05, t * 0.04)) * 6.28318; // rotating field direction
vec2 dirVec = vec2(cos(dir), sin(dir));

vec2 flow = vec2(
  fbm(uv * 3.0 + dirVec * t * 0.25),
  fbm(uv * 3.0 - dirVec.yx * t * 0.22)
) - 0.5;

//more flow movement
float driftAngle = sin(t * 0.12) * 3.1415;
vec2 drift = vec2(cos(driftAngle), sin(driftAngle)) * 0.05;


vec2 lookupUV = clamp(
  uv
  + drift
  + warp
  + flow * 0.08
  - vel * uAdvectStrength,
  0.001, 0.999
);

lookupUV += vec2(
  sin(uv.y * 8.0 + t * 1.2),
  cos(uv.x * 6.0 - t * 1.1)
) * 0.008;
  
  float heat  = clamp(baseHeat(lookupUV, t), 0.0, 1.0);
  float velMag = length(vel) * 0.8;  // Velocity magnitude
  float darkBoost = (1.0 - heat) * velMag * 0.35;  // Boost in dark areas only
  heat = clamp(heat + darkBoost, 0.0, 1.0);
  
  float lightCut = smoothstep(0.65, 1.0, heat) * velMag * 0.45;
heat -= lightCut;

  float pulse = fbm(uv * 2.5 + t * 0.3);
heat = heat / (1.0 + heat * 0.1);
heat *= mix(0.9, 1.2, pulse);
  
  vec3  color = colorRamp(heat);

  // Temporally-dithered film grain
  float gTime = uTime * uGrainSpeed;
  float gf    = floor(gTime);
  float gfrac = fract(gTime);
  vec2  gUV   = floor(uv * uResolution / (uGrainSize * uDPR))
              / (uResolution / (uGrainSize * uDPR));
  vec2  offA  = vec2(hash(vec2(gf,      0.0)), hash(vec2(0.0, gf      ))) * 100.0;
  vec2  offB  = vec2(hash(vec2(gf+1.0,  0.0)), hash(vec2(0.0, gf+1.0  ))) * 100.0;
  float gr    = mix(hash(gUV+offA)-0.5, hash(gUV+offB)-0.5, gfrac) * uGrain;

  gl_FragColor = vec4(clamp(color + gr, 0.0, 1.0), 1.0);
}
`

// ─── Component ────────────────────────────────────────────────────────────────
export default function MovingGradient({ mousePosition }) {
  const mat      = useRef()
  const { size } = useThree()

  const FLUID_COLS = 72
  const FLUID_ROWS = 54
  const fluid      = useRef(null)
  const velTex     = useRef(null)
  const velBuf     = useRef(new Float32Array(FLUID_COLS * FLUID_ROWS * 4))
  const prevMouse  = useRef({ x: mousePosition.x, y: mousePosition.y })

  if (!fluid.current) fluid.current = createFluidGrid(FLUID_COLS, FLUID_ROWS)

  // ── Leva ──────────────────────────────────────────────────────────────────
  const { driftSpeed, driftAmt, advectStrength, penSize, viscosity, forceScale } = useControls('Motion', {
    driftSpeed:     { value: 1.5,  min: 0.05, max: 2.0,  step: 0.05,  label: 'drift speed'   },
    driftAmt:       { value: 0.08, min: 0.0,  max: 0.12, step: 0.005, label: 'warp amount'   },
    advectStrength: { value: 0.25,  min: 0.0,  max: 0.50, step: 0.01,  label: 'trail depth'   },
    penSize:        { value: 0.1,  min: 0.03, max: 0.40, step: 0.01,  label: 'cursor radius' },
    viscosity:      { value: 0.9, min: 0.90, max: 0.999,step: 0.001, label: 'viscosity'     },
    forceScale:     { value: 3.0,   min: 0.1,  max: 6.0,  step: 0.1,   label: 'force'         },
  })

  const { grain, grainSize, grainSpeed } = useControls('Grain', {
    grain:      { value: 0.040, min: 0.0,  max: 0.10, step: 0.002               },
    grainSize:  { value: 3.0,   min: 1.0,  max: 10.0, step: 1.0                 },
    grainSpeed: { value: 2.0,   min: 1.0,  max: 15.0, step: 1.0, label: 'grain speed' },
  })

  const { col0, col1, col2, col3, col4, col5, col6, col7 } = useControls('Colors', {
    col0: { value: '#000000', label: 'black'          },
    col1: { value: '#1c0200', label: 'near-black'     },
    col2: { value: '#4a0700', label: 'deep crimson'   },
    col3: { value: '#7e1000', label: 'dark red'       },
    col4: { value: '#c03010', label: 'red-orange'     },
    col5: { value: '#d94020', label: 'vivid red'      },
    col6: { value: '#d88060', label: 'warm salmon'    },
    col7: { value: '#e8aa80', label: 'peach peak'     },
  })

  // ── DataTexture ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tex = new THREE.DataTexture(
      velBuf.current, FLUID_COLS, FLUID_ROWS,
      THREE.RGBAFormat, THREE.FloatType
    )
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS     = THREE.ClampToEdgeWrapping
    tex.wrapT     = THREE.ClampToEdgeWrapping
    velTex.current = tex
    return () => tex.dispose()
  }, [])

  // ── ShaderMaterial ─────────────────────────────────────────────────────────
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
      uCol0: new THREE.Color(col0),
      uCol1: new THREE.Color(col1),
      uCol2: new THREE.Color(col2),
      uCol3: new THREE.Color(col3),
      uCol4: new THREE.Color(col4),
      uCol5: new THREE.Color(col5),
      uCol6: new THREE.Color(col6),
      uCol7: new THREE.Color(col7),
    },
    vertexShader,
    fragmentShader
  )

  extend({ GradientMaterial })

  // ── Frame loop ─────────────────────────────────────────────────────────────
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
    m.uCol0.set(col0); m.uCol1.set(col1); m.uCol2.set(col2); m.uCol3.set(col3)
    m.uCol4.set(col4); m.uCol5.set(col5); m.uCol6.set(col6); m.uCol7.set(col7)

    const mx  = mousePosition.x
    const my  = mousePosition.y
    const dvx = mx - prevMouse.current.x
    const dvy = my - prevMouse.current.y

    fluid.current.addVelocity(mx, my, dvx, dvy, penSize, forceScale)
    fluid.current.step(viscosity)

    const { xv, yv } = fluid.current
    const buf         = velBuf.current
    const VMAX        = 0.035
    for (let i = 0; i < FLUID_COLS * FLUID_ROWS; i++) {
      buf[i*4+0] = Math.max(-1, Math.min(1, xv[i] / VMAX)) * 0.5 + 0.5
      buf[i*4+1] = Math.max(-1, Math.min(1, yv[i] / VMAX)) * 0.5 + 0.5
      buf[i*4+2] = 0.0
      buf[i*4+3] = 1.0
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