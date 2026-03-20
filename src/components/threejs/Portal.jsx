import { shaderMaterial } from '@react-three/drei'
// import { Perf } from 'r3f-perf'
import portalVertex from './shaders/portal/vertex.glsl'
import portalFragment from './shaders/portal/fragment.glsl'
import * as THREE from 'three'
import { extend, useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { useControls } from 'leva'
import { useEffect } from 'react'

export default function Portal({mousePosition, windowSize})
{

    //3 parameters: uniforms, vertex shader, fragment shader
    const PortalMaterial = shaderMaterial(
        {
            uTime: 0,
            uMouse: {x: mousePosition.x, y: mousePosition.y}
        },
        portalVertex,
        portalFragment
    )
    extend({PortalMaterial: PortalMaterial})

    const portalMaterial = useRef()

    useFrame((state, delta)=> {
        portalMaterial.current.uTime += (delta * 0.3)
        portalMaterial.current.uMouse = mousePosition
    })

    // const [windowSize, setWindowSize] = useState({x:window.innerWidth, y:window.innerHeight})
    // const updateSize = () => {
    //     setWindowSize({x:window.innerWidth, y:window.innerHeight})
    // }
    // window.addEventListener('resize', updateSize)

    return <>

        {/* <Perf position="top-left" /> */}

        {/* <OrbitControls makeDefault /> */}

        <mesh scale={[(windowSize.x)/80, (windowSize.y)/80, 0]}>
            <planeGeometry />
            <portalMaterial ref={portalMaterial}/>
        </mesh>
    </>
}