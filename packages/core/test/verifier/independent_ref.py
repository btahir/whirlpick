#!/usr/bin/env python3
# Verifier-owned (2026-09-29): independent re-derivation of whirlpick-draw-v1 V0-V2 and the B1
# 2-entry fairness p-value, written from PLAN section 2 only (stdlib hashlib/unicodedata, not from the
# TypeScript or scripts/ref). Run: python3 packages/core/test/verifier/independent_ref.py [--b1]
import hashlib, struct, unicodedata, json, sys
H=lambda b: hashlib.sha256(b).digest()
tag=lambda s: s.encode()+b'\0'
u32=lambda x: struct.pack('>I',x)
def milli(w):
    m=round(w*1000); assert abs(w*1000-m)<1e-6 and 1<=m<=10**9; return m
def wheel_bytes(entries):
    b=tag("whirlpick-wheel-v1")+u32(len(entries))
    for e in entries:
        l=unicodedata.normalize('NFC',e['label']).encode()
        b+=u32(len(l))+l+u32(milli(e.get('weight',1)))+bytes([1 if e.get('enabled',True) else 0])
        tags=e.get('tags',[])
        b+=u32(len(tags))
        for t in tags:
            t=unicodedata.normalize('NFC',t).encode(); b+=u32(len(t))+t
    return b
class Stream:
    def __init__(s,key,wh,si): s.key,s.wh,s.si,s.c,s.buf,s.n=key,wh,si,0,b'',0
    def read(s,k):
        while len(s.buf)<k:
            s.buf+=H(tag("whirlpick-draw-v1")+s.key+s.wh+u32(s.si)+u32(s.c)); s.c+=1
        r,s.buf=s.buf[:k],s.buf[k:]; s.n+=k; return r
    def u32(s): return int.from_bytes(s.read(4),'big')
    def u64(s): return int.from_bytes(s.read(8),'big')
    def below(s,n):
        if n==1: return 0
        lim=2**64-(2**64%n)
        while True:
            x=s.u64()
            if x<lim: return x%n
def key_for(seed,pi):
    return H(tag("whirlpick-mix-v1")+seed+unicodedata.normalize('NFC',pi).encode()) if pi else seed
def picks(entries,seed,pi,si,count,excluded=()):
    wh=H(wheel_bytes(entries)); st=Stream(key_for(seed,pi),wh,si)
    elig=[i for i,e in enumerate(entries) if e.get('enabled',True) and i not in excluded]
    out=[]
    for _ in range(count):
        T=sum(milli(entries[i].get('weight',1)) for i in elig)
        r=st.below(T); acc=0
        for i in elig:
            acc+=milli(entries[i].get('weight',1))
            if r<acc: w=i; break
        lu=st.u32(); out.append({'index':w,'label':entries[w]['label'],'landingU32':lu,'T':T,'r':r}); elig.remove(w)
    return wh.hex(),out

def main():
    seed=bytes(range(32))
    E=[{'label':x} for x in ["Ada","Grace","Linus","Margaret"]]
    wb=wheel_bytes(E); print('wheelBytes',wb.hex())
    print('wheelHash',H(wb).hex())
    print('commitment',H(tag("whirlpick-commit-v1")+seed).hex())
    print('block0',H(tag("whirlpick-draw-v1")+seed+H(wb)+u32(0)+u32(0)).hex())
    st=Stream(seed,H(wb),0); print('randBelow10x5',[st.below(10) for _ in range(5)])
    print('phrase',H(tag("whirlpick-seed-v1")+unicodedata.normalize('NFC',"whirlpick test vector 3").encode()).hex())
    wh,p=picks(E,seed,None,0,1); print('V1',p)
    f=0.05+0.9*(p[0]['landingU32']/2**32); lt=(2000+f*1000)/4000  # cumBefore(Linus) = 2000 milli
    print('V1 landingTurn %.17g'%lt, 'finalRot(0,5,0) %.17g'%(0+5+((0-lt-0)%1)))
    E2=[{"label":"Red","weight":1},{"label":"Green","weight":2.5},{"label":"Blue","weight":0.125},{"label":"Gold","weight":5,"enabled":False}]
    s2=b'\xff'*32
    print('V2 key',key_for(s2,"blue sky").hex())
    wh,p=picks(E2,s2,"blue sky",3,2); print('V2 wheelHash',wh,p)

def b1():
    import math
    E=[{'label':'E1'},{'label':'E2'}]
    wh=H(wheel_bytes(E)); c=[0,0]
    for i in range(100000):
        st=Stream(H(tag("whirlpick-fairness-fixture")+u32(i)),wh,0)
        c[0 if st.below(2000)<1000 else 1]+=1
    x=sum((o-50000)**2/50000 for o in c)
    print('B1 uniform 2', c, 'chi2', x, 'p', math.erfc(math.sqrt(x/2)))

if __name__=='__main__':
    main()
    if '--b1' in sys.argv: b1()
