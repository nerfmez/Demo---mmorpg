import base64
import os; d=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','beach')+'/'
s=open(d+'src.html').read().replace('%%REF%%','data:image/jpeg;base64,'+__import__('base64').b64encode(open(d+'../concepts/arrival-beach-40deg.jpg','rb').read()).decode())
s=s.replace('%%HERO%%',base64.b64encode(open(d+'hero.glb','rb').read()).decode())
open(d+'index.html','w').write(s)
print(len(s))
