import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function Grain() {
    const material = useRef()
    const { size } = useThree()

   useFrame(({ clock }) => {
    material.current.uniforms.uTime.value = clock.elapsedTime
    })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={{
            uTime: { value: 0 },
            uIntensity: { value: 0.5 },
            uResolution: { value: [size.width, size.height] },
            uSpeed: { value: 0.5 },
        }}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
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
    uniform float uIntensity;
    uniform vec2 uResolution;
    uniform float uSpeed;

    float random(vec2 uv) {
        return fract(sin(dot(uv ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution;

        vec2 grainUV = floor(uv * 100.0) / 100.0;

        float noise = random(grainUV + uTime);
        float grain = (noise - 0.5) * 0.5;

        gl_FragColor = vec4(vec3(grain * 1.0), uIntensity);
    }
`