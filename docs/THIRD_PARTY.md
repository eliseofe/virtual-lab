# Third-party physics code

The optional quadrotor backend uses Ammo.js/Bullet (`ammojs3` 0.0.11, zlib
license). The build copies its license beside the generated module and WASM.
Generated vendor bundles are ignored by Git; the dependency version and integrity
hash are recorded in the npm lockfile.

`web/src/runtime/backends/flight-control.js` adapts the CF2X DSLPIDControl
implementation from [gym-pybullet-drones](https://github.com/utiasDSL/gym-pybullet-drones)
by Jacopo Panerati (MIT). The license is included in
[licenses/gym-pybullet-drones.txt](licenses/gym-pybullet-drones.txt).
The yaw-rate reference fixture contains synthetic numerical inputs/outputs from
the Python controller, not research observations.
