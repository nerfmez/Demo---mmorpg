import base64
d='/tmp/claude-0/-home-user-Demo---mmorpg/bb51cd67-611b-5612-bae1-8a46bb84f0d0/scratchpad/chibi/'
s=open(d+'src.html').read().replace('%%CHIBI%%',base64.b64encode(open(d+'chibi.glb','rb').read()).decode())
open(d+'index.html','w').write(s); print(len(s))
