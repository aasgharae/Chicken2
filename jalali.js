function __div(a,b){return~~(a/b)}
function __mod(a,b){return a-~~(a/b)*b}
function __jalCal(jy){
  var breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
  var bl=breaks.length,gy=jy+621,leapJ=-14,jp=breaks[0],jump=0,i,jm,n,leap,leapG,march;
  if(jy<jp||jy>=breaks[bl-1])throw new Error('Invalid Jalaali year');
  for(i=1;i<bl;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ=leapJ+__div(jump,33)*8+__div(__mod(jump,33),4);jp=jm}
  n=jy-jp;leapJ=leapJ+__div(n,33)*8+__div(__mod(n,33)+3,4);
  if(__mod(jump,33)===4&&jump-n===4)leapJ+=1;
  leapG=__div(gy,4)-__div((__div(gy,100)+1)*3,4)-150;march=20+leapJ-leapG;
  if(jump-n<6)n=n-jump+__div(jump+4,33)*33;
  leap=__mod(__mod(n+1,33)-1,4);if(leap===-1)leap=4;
  return{leap:leap,gy:gy,march:march};
}
function g2d(gy,gm,gd){var d=__div((gy+__div(gm-8,6)+100100)*1461,4)+__div(153*__mod(gm+9,12)+2,5)+gd-34840408;d=d-__div(__div(gy+100100+__div(gm-8,6),100)*3,4)+752;return d}
function d2g(jdn){var j=4*jdn+139361631;j=j+__div(__div(4*jdn+183187720,146097)*3,4)*4-3908;var i=__div(__mod(j,1461),4)*5+308;var gd=__div(__mod(i,153),5)+1;var gm=__mod(__div(i,153),12)+1;var gy=__div(j,1461)-100100+__div(8-gm,6);return{gy:gy,gm:gm,gd:gd}}
function j2d(jy,jm,jd){var r=__jalCal(jy);return g2d(r.gy,3,r.march)+(jm-1)*31-__div(jm,7)*(jm-7)+jd-1}
function d2j(jdn){var gy=d2g(jdn).gy,jy=gy-621,r=__jalCal(jy),jdn1f=g2d(gy,3,r.march),jd,jm,k;k=jdn-jdn1f;if(k>=0){if(k<=185){jm=1+__div(k,31);jd=__mod(k,31)+1;return{jy:jy,jm:jm,jd:jd}}else k-=186}else{jy-=1;k+=179;if(r.leap===1)k+=1}jm=7+__div(k,30);jd=__mod(k,30)+1;return{jy:jy,jm:jm,jd:jd}}
function isLeapJalali(jy){return __jalCal(jy).leap===0}
function jalaliMonthLength(jy,jm){if(jm<=6)return 31;if(jm<=11)return 30;return isLeapJalali(jy)?30:29}
