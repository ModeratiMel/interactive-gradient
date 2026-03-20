import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

export default function SmoothGradient() {
  const material = useRef()
  const { size, mouse } = useThree()

  const {
    speed,
    scale,
    grain,
    mouseInfluence,
    mouseRadius,
    orangeStart,
    orangeEnd,
    whiteStart,
    whiteEnd,
  } = useControls('Gradient', {
    speed: { value: 0.15, min: 0.01, max: 1, step: 0.01 },
    scale: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
    grain: { value: 0.015, min: 0.0, max: 0.1, step: 0.001 },

    // 🖱️ mouse controls
    mouseInfluence: { value: 0.4, min: 0, max: 1, step: 0.01 },
    mouseRadius: { value: 0.3, min: 0.05, max: 1, step: 0.01 },

    orangeStart: { value: 0.35, min: 0, max: 1 },
    orangeEnd: { value: 0.65, min: 0, max: 1 },
    whiteStart: { value: 0.8, min: 0, max: 1 },
    whiteEnd: { value: 0.98, min: 0, max: 1 },
  })

  useFrame(({ clock }) => {
    if (material.current) {
      material.current.uniforms.uTime.value = clock.elapsedTime
      material.current.uniforms.uResolution.value = [size.width, size.height]

      // convert mouse (-1 to 1) → (0 to 1)
      material.current.uniforms.uMouse.value = [
        (mouse.x + 1) / 2,
        (mouse.y + 1) / 2,
      ]

      material.current.uniforms.uSpeed.value = speed
      material.current.uniforms.uScale.value = scale
      material.current.uniforms.uGrain.value = grain

      material.current.uniforms.uMouseInfluence.value = mouseInfluence
      material.current.uniforms.uMouseRadius.value = mouseRadius

      material.current.uniforms.uOrangeStart.value = orangeStart
      material.current.uniforms.uOrangeEnd.value = orangeEnd
      material.current.uniforms.uWhiteStart.value = whiteStart
      material.current.uniforms.uWhiteEnd.value = whiteEnd
    }
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={{
          uTime: { value: 0 },
          uResolution: { value: [size.width, size.height] },
          uMouse: { value: [0.5, 0.5] },

          uSpeed: { value: speed },
          uScale: { value: scale },
          uGrain: { value: grain },

          uMouseInfluence: { value: mouseInfluence },
          uMouseRadius: { value: mouseRadius },

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
  )
}

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;

uniform float uSpeed;
uniform float uScale;
uniform float uGrain;

uniform float uMouseInfluence;
uniform float uMouseRadius;

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

  // base flowing field (your blobs)
  float field =
    sin(uv.x * uScale + t * 1.2) +
    sin(uv.y * uScale - t * 0.9) +
    sin((uv.x + uv.y) * (uScale * 0.8) + t * 0.7);

  field /= 3.0;

  float gradient = field * 0.5 + 0.5;

  // 🖱️ mouse blob (soft radial influence)
  float dist = distance(uv, uMouse);
  float mouseBlob = smoothstep(uMouseRadius, 0.0, dist);

  // blend mouse into field (not replace!)
  gradient = mix(gradient, 1.0, mouseBlob * uMouseInfluence);

  vec3 black = vec3(0.0);
  vec3 orange = vec3(1.0, 0.4, 0.0);
  vec3 white = vec3(1.0);

  vec3 color = mix(black, orange, smoothstep(uOrangeStart, uOrangeEnd, gradient));
  color = mix(color, white, smoothstep(uWhiteStart, uWhiteEnd, gradient));

  float g = (random(uv + t * 2.0) - 0.5) * uGrain;
  color += g;

  gl_FragColor = vec4(color, 1.0);
}
`