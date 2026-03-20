import { Sparkles, OrbitControls, Clouds, Cloud } from '@react-three/drei'
import * as THREE from 'three'
import { Perf } from 'r3f-perf'
import { useControls } from 'leva'
import { PerspectiveCamera } from "@react-three/drei";

export default function GalaxyExp({mousePosition}){

    const mouse = {
        x: -10*mousePosition.x,
        y: 2*2*(mousePosition.y - 0.5)
    }

    // const {color1, color2, color3, color4, fov, cameraX, cameraY, cameraZ} = useControls({
    //     color1: {value: '#e02b86'},
    //     color2: {value: '#5351ff'},
    //     color3: {value: '#121029'},
    //     color4: {value: '#c7fbff'},

    //     cameraX: {value: 0, min: -10, max: 10, step: 0.1},
    //     cameraY: {value: 0, min: -19, max: 10, step: 0.1},
    //     cameraZ: {value: 0, min: -19, max: 10, step: 0.1},
    //     fov: {value: 100, min: 0, max: 100, step: 0.1},
    // })

    return (
        <>
            {/* <Perf position="top-left" />
            <OrbitControls makeDefault /> */}

            <PerspectiveCamera position={[mousePosition.x, mousePosition.y, (mousePosition.x - mousePosition.y)]} fov={100} makeDefault={true} />

            <Clouds material={THREE.MeshBasicMaterial}>
                <Cloud seed={1} scale={2} volume={1} color="#e02b86" fade={10} />
                <Cloud seed={1} volume={10} color='#5351ff' fade={10} />
                <Cloud seed={1} volume={5} color='#121029' fade={10} />
                <Cloud seed={1} volume={2} color='#c7fbff' fade={10} />
            </Clouds>

            <Sparkles 
                size={3}
                scale={[6, 6, 6]} //box where theyll move around
                position-y={1.1}
                speed={0.8}
                count={100}
            />
        </>
    )
}