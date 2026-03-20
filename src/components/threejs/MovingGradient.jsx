import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { Perf } from 'r3f-perf'

export default function SmoothGradient() {
  const material = useRef()
  const { size } = useThree()

  // 🎛️ Leva controls
  const {
    speed,
    scale,
    grain,
    orangeStart,
    orangeEnd,
    whiteStart,
    whiteEnd,
  } = useControls({
    speed: { value: 1, min: 0.01, max: 2, step: 0.01 },
    scale: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
    grain: { value: 0.015, min: 0.0, max: 0.1, step: 0.001 },
    orangeStart: { value: 0.35, min: 0, max: 1, step: 0.01 },
    orangeEnd: { value: 0.65, min: 0, max: 1, step: 0.01 },
    whiteStart: { value: 0.75, min: 0, max: 1, step: 0.01 },
    whiteEnd: { value: 0.95, min: 0, max: 1, step: 0.01 },
  })

  useFrame(({ clock }) => {
    if (material.current) {
      material.current.uniforms.uTime.value = clock.elapsedTime
      material.current.uniforms.uResolution.value = [size.width, size.height]

      material.current.uniforms.uSpeed.value = speed
      material.current.uniforms.uScale.value = scale
      material.current.uniforms.uGrain.value = grain

      material.current.uniforms.uOrangeStart.value = orangeStart
      material.current.uniforms.uOrangeEnd.value = orangeEnd
      material.current.uniforms.uWhiteStart.value = whiteStart
      material.current.uniforms.uWhiteEnd.value = whiteEnd
    }
  })

  return (<>
     {/* <Perf position="top-left" /> */}
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={{
          uTime: { value: 0 },
          uResolution: { value: [size.width, size.height] },
          uSpeed: { value: speed },
          uScale: { value: scale },
          uGrain: { value: grain },

          uOrangeStart: { value: orangeStart },
          uOrangeEnd: { value: orangeEnd },
          uWhiteStart: { value: whiteStart },
          uWhiteEnd: { value: whiteEnd },
        }}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthWrite={false}
      />
    </mesh>
 </> )
}

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform float uSpeed;
uniform float uScale;
uniform float uGrain;

uniform float uOrangeStart;
uniform float uOrangeEnd;
uniform float uWhiteStart;
uniform float uWhiteEnd;

float random(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float t = uTime * uSpeed;

  // 🔥 BIGGER BLOBS (scale down frequency)
  float field =
    sin(uv.x * uScale + t * 1.2) +
    sin(uv.y * uScale - t * 0.9) +
    sin((uv.x + uv.y) * (uScale * 0.8) + t * 0.7);

  field /= 3.0;

  float gradient = field * 0.5 + 0.5;

  vec3 black = vec3(0.0);
  vec3 orange = vec3(1.0, 0.4, 0.0);
  vec3 white = vec3(1.0);

  // 🔥 SOFTER FEATHERING (fully controllable)
  vec3 color = mix(black, orange, smoothstep(uOrangeStart, uOrangeEnd, gradient));
  color = mix(color, white, smoothstep(uWhiteStart, uWhiteEnd, gradient));

  // subtle grain
  float g = (random(uv + t * 2.0) - 0.5) * uGrain;
  color += g;

  gl_FragColor = vec4(color, 1.0);
}
`