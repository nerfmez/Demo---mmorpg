"""Read-only design diagram: python render-plan.py /path/to/basis.json.

Requires numpy, matplotlib and Pillow. Sampling masks are a planning aid, not
runtime collisions or a substitute for engine navigation tests.
"""
import json, sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle, Rectangle
from matplotlib import patheffects as pe

here=Path(__file__).resolve().parent
plan=json.loads((here/'plan.json').read_text())
basis=json.loads(Path(sys.argv[1]).read_text())
colors={'A':'#ad734c','F':'#64567d','M':'#32716a'}
paper='#f3f0e2'
fig=plt.figure(figsize=(18,10),facecolor=paper)
ax=fig.add_axes([.045,.17,.92,.72],facecolor='#cad9d6')
fig.text(.045,.955,'FRONTIER  /  LANDSCAPE PLAN',fontsize=25,weight='bold',color='#243d3b')
fig.text(.045,.918,'40° gameplay camera • Atlas positions from current source • Proposed terrain and upright masses',fontsize=12,color='#536966')
stats=[]

def line_dist(X,Z,pts):
 out=np.full(X.shape,np.inf)
 for a,b in zip(pts,pts[1:]):
  dx,dz=b[0]-a[0],b[1]-a[1]
  t=np.clip(((X-a[0])*dx+(Z-a[1])*dz)/(dx*dx+dz*dz or 1),0,1)
  out=np.minimum(out,np.hypot(X-a[0]-dx*t,Z-a[1]-dz*t))
 return out

for r in basis['regions']:
 b=r['bounds'];ox,oz=r['offset'];h,w=r['h'],r['w'];res=r['res']
 heights=np.array(r['heights']).reshape(h,w)
 water=np.array(r['water']).reshape(h,w).astype(bool)
 protected=np.array(r['protectedCells']).reshape(h,w).astype(bool)
 rgb=np.array([[int(s[n:n+2],16)/255 for n in (1,3,5)] for s in r['palette']]).reshape(h,w,3)
 dz,dx=np.gradient(heights,res,res);shade=np.clip(.92-(dx+dz)*.2,.68,1.12)
 rgb=np.clip(rgb*shade[...,None],0,1)
 rgb[water]=[.48,.71,.74]
 extent=[b['minX']+ox,b['maxX']+ox,b['maxZ']+oz,b['minZ']+oz]
 ax.imshow(rgb,extent=extent,origin='upper',interpolation='bilinear',zorder=1)
 xs=b['minX']+(np.arange(w)+.5)*res;zs=b['minZ']+(np.arange(h)+.5)*res
 X,Z=np.meshgrid(xs,zs)
 rgba=np.zeros((h,w,4));total=np.zeros((h,w),bool)
 for f in [f for f in plan['features'] if f['region']==r['id']]:
  raw=line_dist(X,Z,f['points'])<f['width']/2
  keep=raw&~protected
  total|=keep
  col=colors[f['id'][0]]
  for n in range(3):rgba[:,:,n][keep]=int(col[1+2*n:3+2*n],16)/255
  rgba[:,:,3][keep]=.96
  stats.append({'id':f['id'],'sampledProposedAreaM2':int(keep.sum()*res*res),'maskedAreaM2':int((raw&protected).sum()*res*res)})
  indices=np.argwhere(keep)
  if len(indices):
   # Put the code within surviving authored terrain rather than on a protected route.
   j,i=indices[len(indices)//2]
   ax.text(xs[i]+ox,zs[j]+oz,f['id'],color='white',fontsize=9,weight='bold',ha='center',va='center',zorder=8,
    path_effects=[pe.withStroke(linewidth=2.5,foreground=col)])
 ax.imshow(rgba,extent=extent,origin='upper',interpolation='nearest',zorder=3)
 if r['city']:
  for floor in r['city']['floors']:
   ax.add_patch(Polygon(np.array(floor['points'])+[ox,oz],facecolor='#d5cbae',edgecolor='#8a8877',lw=.4,zorder=2))
   for hole in floor.get('holes',[]):ax.add_patch(Polygon(np.array(hole)+[ox,oz],facecolor='#7eb5bd',edgecolor='none',zorder=2.1))
  for road in r['city']['roads']:
   for loop in road['loops']:ax.add_patch(Polygon(np.array(loop)+[ox,oz],facecolor='#eee5c8',edgecolor='none',zorder=2.2))
 for road in r['roads']:
  xy=np.array(road['points'])+[ox,oz]
  ax.plot(xy[:,0],xy[:,1],color='#8b805b',lw=3,alpha=.9,zorder=4,solid_capstyle='round')
  ax.plot(xy[:,0],xy[:,1],color='#f8efd2',lw=1.8,zorder=4.1,solid_capstyle='round')
 for c in [c for c in plan['openCourts'] if c['region']==r['id']]:
  x,z=np.array(c['at'])+[ox,oz]
  ax.add_patch(Circle((x,z),c['diameter']/2,edgecolor='#ffe5a0',facecolor='#eec46433',lw=1.3,zorder=5))
 for lm in r['landmarks']:
  x,z=np.array(lm['at'])+[ox,oz]
  ax.scatter([x],[z],s=17,color='#fff1b5',edgecolors='#6b633f',linewidths=.5,zorder=6,marker='D')
 for entry in r['town'].get('buildings',[]):
  if not isinstance(entry,dict):continue
  a=entry['angle'];c,s=np.cos(a),np.sin(a)
  pts=np.array([[-entry['hx'],-entry['hz']],[entry['hx'],-entry['hz']],[entry['hx'],entry['hz']],[-entry['hx'],entry['hz']]])
  xy=pts@np.array([[c,-s],[s,c]])+[entry['x']+ox,entry['z']+oz]
  ax.add_patch(Polygon(xy,facecolor='#a88165',edgecolor='#675f49',lw=.3,zorder=4.5))
 # Source rectangles are subtle registration guides, never new walls.
 ax.add_patch(Rectangle((b['minX']+ox,b['minZ']+oz),b['maxX']-b['minX'],b['maxZ']-b['minZ'],fill=False,ec='#577678',ls=(0,(3,4)),lw=.7,zorder=5))

for x,z,name in [(-395,-243,'GREENHOLLOW FRONTIER'),(25,-243,'MOONROOT GROVE'),(30,-106,'AZURE COAST')]:
 ax.text(x,z,name,ha='center',va='center',fontsize=11,weight='bold',color='#213e36',zorder=9,
  bbox=dict(boxstyle='round,pad=.35',fc=paper,ec='none',alpha=.94))
ax.annotate('N',xy=(196,-218),xytext=(196,-184),ha='center',fontsize=12,color='#294d4b',arrowprops=dict(arrowstyle='-|>',color='#294d4b',lw=1.5),zorder=10)
ax.plot([-585,-535],[150,150],color='#294d4b',lw=3,zorder=10)
ax.text(-560,163,'50 m',ha='center',fontsize=10,color='#294d4b')
ax.set_xlim(-620,222);ax.set_ylim(188,-250);ax.set_aspect('equal')
ax.tick_params(labelsize=8,colors='#5d7067');ax.set_xlabel('Atlas X / metres',fontsize=9,color='#536966')
ax.set_ylabel('Atlas Z / metres',fontsize=9,color='#536966')
for spine in ax.spines.values():spine.set_visible(False)
legend=[('A1–A4','#ad734c','Coastal cliffs / meadow banks'),('F1–F6','#64567d','Forest walls / terraces / ruins'),('M1–M3','#32716a','Moonroot bluffs / rooted shelves')]
for i,(code,col,label) in enumerate(legend):
 x=.045+i*.31
 fig.patches.append(Rectangle((x,.112),.012,.018,transform=fig.transFigure,facecolor=col,ec='none'))
 fig.text(x+.02,.115,code+'  '+label,fontsize=10,color='#314a43')
fig.text(.045,.071,'Pale roads = existing routes    Gold diamonds = existing landmarks    Gold circles = proposed open courts',fontsize=10,color='#536966')
fig.text(.045,.038,'Design proposal • 2 m sampling • Protected roads, town floors, water, anchors and shared seam bands cut out of every mass',fontsize=9,color='#6d776d')
fig.savefig(here/'registered-plan.png',dpi=160,facecolor=paper)
plt.close(fig)
(here/'placement-review.json').write_text(json.dumps({'source':basis['source'],'sampleMetres':res,'runtimeNavigationTested':False,'features':stats},indent=2)+'\n')
print(json.dumps({'figure':str(here/'registered-plan.png'),'features':len(stats),'emptyFeatures':[s['id'] for s in stats if not s['sampledProposedAreaM2']]}))
