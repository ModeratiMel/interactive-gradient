import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, InstancedRigidBodies, Physics, RigidBody} from '@react-three/rapier'
import { useMemo, useRef } from 'react'

export default function PhysicsExp({mousePosition})
{

    const mouse = {
        x: 6*(mousePosition.x - 0.5),
        y: -4.5*(mousePosition.y - 0.5)
    }

    const ball = useRef()

    const matcapTexture = useTexture('/bubble.png')

    useFrame(()=> {
        ball.current.setNextKinematicTranslation({x:mouse.x, y:mouse.y, z:3})
    })

    const ballsCount = 100
    const instances = useMemo(() => {
        const instances = []
        for (let i = 0; i < ballsCount; i++) {
            instances.push({
                key: 'instance_' + i,
                position: [
                    (Math.random() - 0.5) * 8, 
                    i*0.05 * (Math.random() - 0.5), 
                    3+(Math.random())
                ],
                scale: Math.max(Math.random(), 0.5) * 0.4
            })
        }
        return instances
    }, [])

    return <>

        {/* <Perf position="top-left" /> */}

        {/* <OrbitControls makeDefault /> */}

        <Physics debug={false} gravity={[0, -5, 0]}>

            {/* Mouse */}
            <RigidBody 
                gravityScale={0} 
                ref={ball}  
                position={[0, 0, 3]}
                friction={0}
                type="kinematicPosition"> 
                    <CuboidCollider args={[0.25, 0.25, 5]}/>
            </RigidBody>


            {/* invisible walls */}
            <RigidBody type="fixed">
                {/* side walls */}
                <CuboidCollider args={[6, 3.5, 0.5]} position={[0, 0, 5.5]}/>
                <CuboidCollider args={[6, 3.5, 0.5]} position={[0, 0, 1]}/>
                <CuboidCollider args={[0.5, 3, 2]} position={[5.5, 0, 3]}/>
                <CuboidCollider args={[0.5, 3, 2]} position={[-5.5, 0, 3]}/>
                {/* top and bottom */}
                <CuboidCollider args={[ 6, 0.5, 2 ]} position={[0, 3, 3]}/>
                <CuboidCollider args={[ 6, 0.5, 2 ]} position={[0, -3, 3]}/>
            </RigidBody>

            {/* Balls */}
            <InstancedRigidBodies instances={instances} colliders="ball" restitution={0.5} friction={0.1} gravityScale={0.001}>
                <instancedMesh args={[null, null, ballsCount]}>
                    <sphereGeometry />
                    <meshMatcapMaterial 
                        matcap={matcapTexture}
                        transparent
                        opacity={0.65}
                    />
                </instancedMesh>
            </InstancedRigidBodies>

        </Physics>

    </>
}