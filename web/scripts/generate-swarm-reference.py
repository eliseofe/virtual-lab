"""Generate deterministic numerical test fixtures from the published DM equations.

Requires NumPy. These synthetic fixtures are tests, not experimental observations.
The reference uses a vectorized receiver-by-source calculation independent of the
restricted controller implementation. Run from the repository root.
"""
import json
from pathlib import Path
import numpy as np

samples = []
for physical in (False, True):
    scale = .3 if physical else 1.
    for response in (0., 1.):
        for close in (False, True):
            points = np.array([[.4,.8],[1.1,.6],[.7,1.5],[1.4,1.3],[1.8,.8],[1.6,1.6]]) * scale
            if close:
                points[3] = points[0] + np.array([.03, .04]) * scale
            groups = np.array([0,0,0,1,1,1])
            headings = np.array([-.9,.5,2.8,1.2,-2.4,.1])
            R, cutoff, sigma, strength = 3*scale, 3.5*scale, .7*scale, 12.
            lam = .2 if physical else 1.
            delta = points[None,:,:] - points[:,None,:]
            raw = np.linalg.norm(delta, axis=2)
            opposite = (groups[:,None] != groups[None,:]) & (raw <= R)
            signal = np.divide(opposite.sum(axis=1), (raw * opposite).sum(axis=1), out=np.zeros(6), where=(raw*opposite).sum(axis=1)>0)
            effective = sigma*(1+lam*np.where(groups==0,1,-response)*signal)
            d = raw+1e-9
            same = (groups[:,None] == groups[None,:]) & (~np.eye(6,dtype=bool)) & (d<=cutoff)
            magnitude = strength*(effective[:,None]**2/d**3 - 2*effective[:,None]**4/d**5)
            unit = np.divide(delta, raw[:,:,None],out=np.zeros_like(delta),where=raw[:,:,None]>0)
            force = (same[:,:,None] * magnitude[:,:,None] * unit).sum(axis=1)
            if physical:
                for i,p in enumerate(points):
                    for axis,wall,direction in ((0,0,1),(0,4.4,-1),(1,0,1),(1,7.9,-1)):
                        dist=abs(p[axis]-wall)
                        if 0<dist<.5:
                            force[i,axis]+=.3*direction*2*(1/dist-1/.5)/dist**3
            heading=np.column_stack((np.cos(headings),np.sin(headings)))
            lateral=np.column_stack((-np.sin(headings),np.cos(headings)))
            commands=np.column_stack((.5*(force*heading).sum(axis=1)+.05,.05*(force*lateral).sum(axis=1)))
            samples.append(dict(physical=physical,response=response,positions=points.tolist(),headings=headings.tolist(),commands=commands.tolist()))
Path('web/tests/fixtures/swarm-dm-reference.json').write_text(json.dumps({'source':'Independent NumPy implementation of the DM equations; synthetic states','samples':samples},indent=2)+'\n')
