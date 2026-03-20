import * as THREE from 'three'
// import { MeshNormalMaterial } from 'three'
import { shaderMaterial, OrbitControls } from '@react-three/drei'
import waterVertexShader from './shaders/water/vertex.glsl'
import waterFragmentShader from './shaders/water/fragment.glsl'
import { extend, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { useControls } from 'leva'

export default function Waves({mousePosition, windowSize}){

    const {depthColor, surfaceColor, bigEleveation, bigFrequencyX, bigFrequencyY, bigSpeed, smallEleveation, smallFrequency, smallSpeed, smallIterations, colorOffset, colorMultiplier} = useControls({
        bigEleveation: {value: 0.8, min: -1, max: 2, step: 0.001},
        bigFrequencyX: {value: 1.2, min: -10, max: 10, step: 0.1},
        bigFrequencyY: {value: 0.2, min: -10, max: 10, step: 0.1},
        bigSpeed: {value: 2.2, min: -10, max: 10, step: 0.1},

        smallEleveation: {value:0.73, min: -1, max: 2, step: 0.001},
        smallFrequency: {value: 3.8, min: -10, max: 10, step: 0.1},
        smallSpeed: {value: 3, min: -10, max: 10, step: 0.1},
        smallIterations: {value: 2.5, min: -10, max: 10, step: 0.1},

        depthColor: {value: '#1123c3'},
        surfaceColor: {value: '#f40000'},
        colorOffset: {value: 0.16, min: -1, max: 2, step: 0.001},
        colorMultiplier: {value: 0.4, min: -10, max: 10, step: 0.1},
    })

    const mouse = {
        x: 20*(mousePosition.x - 0.5),
        y: -20*(mousePosition.y - 0.5)
    }

    const water = useRef()

    const WaterMaterial = shaderMaterial(
        {
            uWaterTime: 0,
            uBigWavesElevation: bigEleveation,
            uBigWavesFrequency: {x: bigFrequencyX, y: bigFrequencyY},
            uBigWavesSpeed: bigSpeed,

            uSmallWavesElevation: smallEleveation,
            uSmallWavesFrequency: smallFrequency,
            uSmallWavesSpeed: smallSpeed,
            uSmallWavesIterations: smallIterations,

            uDepthColor: new THREE.Color(depthColor),
            uSurfaceColor: new THREE.Color(surfaceColor),
            uColorOffset: colorOffset,
            uColorMultiplier: colorMultiplier,
            uMouse: {x: mouse.x, y: mouse.y}
        },
        waterVertexShader,
        waterFragmentShader
    )
    extend({WaterMaterial: WaterMaterial})

    useFrame((state, delta)=> {
        water.current.uWaterTime += (delta * 0.3)
        water.current.uBigWavesElevation = bigEleveation
        water.current.uBigWavesFrequency = {x: bigFrequencyX, y: bigFrequencyY},
        water.current.uBigWavesSpeed = bigSpeed,

        water.current.uSmallWavesElevation = smallEleveation,
        water.current.uSmallWavesFrequency = smallFrequency,
        water.current.uSmallWavesSpeed = smallSpeed,
        water.current.uSmallWavesIterations = smallIterations,

        water.current.uColorOffset = colorOffset,
        water.current.uColorMultiplier = colorMultiplier,
        water.current.uDepthColor = new THREE.Color(depthColor)
        water.current.uSurfaceColor = new THREE.Color(surfaceColor)
        water.current.uMouse = mousePosition
    })

    return(<>
        <OrbitControls makeDefault />
        <mesh
            // geometry={new THREE.PlaneGeometry(2, 2, 512, 512)}
            geometry={new THREE.PlaneGeometry( 5, 5, 512, 512 )}
            rotation-x={- Math.PI * 0.5}
            scale={[(windowSize.x)/380, (windowSize.y)/380, 0]}
        >
             {/* <sphereGeometry /> */}
            <waterMaterial ref={water}/>
        </mesh>
    </>)
}