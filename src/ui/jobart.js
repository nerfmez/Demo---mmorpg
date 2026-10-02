// Each passive has an authored silhouette/composition; its badge never encodes grade.
const path=(d,c='#b7cebd')=>`<path d="${d}" fill="${c}" stroke="#354a46" stroke-width="3" stroke-linejoin="round"/>`;
const line=(d,c='#d7b574',w=5)=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle=(x,y,r,c)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#354a46" stroke-width="3"/>`;
const group=(s,t)=>`<g transform="${t}">${s}</g>`;
const blade=path('M58 90V39l10-27 10 27v51z','#e4ddba')+path('M44 85h48v9H72v24h-9V94H44z','#b98757');
const leaf=path('M29 101C9 37 68 16 102 24c3 50-26 81-73 77z','#88ad79')+line('M28 104 85 39','#3b7160',4);
const drop=path('M64 12C49 39 25 61 30 84c8 37 66 34 69 0 2-22-22-51-35-72z','#89babe');
const shield=path('M26 30l38-15 39 15-6 47-33 35-33-35z','#92b4a9')+line('M64 34v52M45 60h38','#e7d7a8',7);
const paw=circle(64,85,24,'#a8c2af')+circle(30,48,11,'#a8c2af')+circle(55,30,12,'#a8c2af')+circle(81,33,11,'#a8c2af')+circle(103,53,10,'#a8c2af');
const arrow=line('M25 105 100 28','#cbb485',7)+path('M76 25l30-5-6 31z','#d4dfcc')+line('M25 86v21h21','#cbb485',6);
const cross=line('M64 32v62M33 63h62','#92c7ae',14);
const ring=line('M30 95C2 50 36 12 80 25c30 8 39 38 19 62','#a6b9da',8)+path('M87 80l-2 24 26-5z','#a6b9da');
const star=path('M64 14l12 32 34 15-34 12-12 35-13-35-35-12 35-15z','#ead199');
const eye=path('M12 63c33-41 72-41 104 0-32 36-71 37-104 0z','#d9d4b9')+circle(64,62,18,'#779eaa')+circle(64,62,7,'#334f58');
export const JOB_ART={
 v5:group(blade,'translate(-5 -3) rotate(22 64 64)')+line('M15 33h26M12 48h20'),
 v6:group(cross,'translate(5 -8) scale(.76)')+path('M20 82l23-6 20 15 33-24 13 13-45 37-37-14z','#d4b398'),
 v7:group(shield,'translate(4 0) scale(.82)')+path('M12 69h16V51h18v19h32V51h18v19h17v45H12z','#b4bdaf'),
 v8:group(blade,'rotate(40 64 64)')+group(drop,'translate(4 52) scale(.46)'),
 v9:group(shield,'translate(20 3) scale(.8)')+group(blade,'translate(-5 4) scale(.6)'),
 v10:group(blade,'translate(7 4) scale(.75)')+line('M16 46C7 104 72 120 112 82M15 66c7 34 48 48 80 30','#d7b574',7),
 a5:circle(64,64,40,'#829db04a')+star+line('M5 40V17h23m73 0h22v23M5 88v23h23m73 0h22V88','#a6b9da',4),
 a6:group(drop,'translate(-4 4) scale(.8)')+line('M85 97c37-23 19-52-8-42M93 65 77 55l13-15','#dcc797',6),
 a7:group(paw,'translate(4 24) scale(.65)')+group(star,'translate(62 -2) scale(.5)'),
 a8:group(star,'translate(-6 22) scale(.75)')+group(star,'translate(61 -4) scale(.48)')+line('M20 111 5 121m92-31 12-9'),
 a9:circle(63,68,47,'#819aae33')+line('M19 90 65 19l44 71z','#a5bed0',4)+group(star,'translate(23 29) scale(.62)'),
 a10:path('M25 35h78l-7 65-31 17-32-17z','#8b9dab')+path('M35 64h59l-7 29-22 12-23-12z','#90c7c2')+group(drop,'translate(42 -5) scale(.4)'),
 r5:group(arrow,'translate(14 -1) scale(.9)')+line('M7 47c29-22 48 9 68-10M7 65c19-10 23 7 39 0','#9bbdab',5),
 r6:group(arrow,'translate(0 7) scale(.86)')+group(drop,'translate(70 45) scale(.45)'),
 r7:group(paw,'translate(-3 0) scale(.76)')+group(arrow,'translate(64 43) scale(.5)'),
 r8:group(ring,'translate(0 2) scale(.95)')+path('M59 38l-9 28h20l-5 30 23-44H66l5-14z','#ded098'),
 r9:path('M55 18h26l-2 58 27 14-2 22H49l-7-14 13-39z','#a18367')+line('M10 54h26M8 74h27M15 94h18','#a6c4c3',6)+group(star,'translate(72 -4) scale(.35)'),
 r10:group(arrow,'translate(-6 0) scale(.79)')+group(arrow,'translate(34 23) scale(.79)')+path('M18 23l13 4 8 17-19-7z','#a4bd81'),
 w5:group(paw,'translate(19 18) scale(.7)')+line('M18 99c-16-56 4-70 28-78M100 24c25 35 10 62-9 80','#9cb8d3',5),
 w6:group(shield,'translate(2 -4) scale(.8)')+group(shield,'translate(50 50) scale(.58)'),
 w7:path('M20 80q44-28 89 0l-12 24H31z','#adc4b2')+group(drop,'translate(40 -7) scale(.55)')+line('M27 85q32 17 71 0','#e9dfba',5),
 w8:group(paw,'translate(36 -2) scale(.75)')+path('M12 82l29-8 22 16 22-12 13 14-36 22-43-12z','#d5b895'),
 w9:group(shield,'translate(0 4) scale(.86)')+group(leaf,'translate(63 34) scale(.48)')+line('M10 115h106','#c3c596',4),
 w10:group(leaf,'translate(-3 1) scale(.85)')+group(leaf,'translate(58 71) rotate(-75) scale(.56)')+line('M61 78v43','#738f63',7),
 va1:group(eye,'translate(0 -4) scale(.75)')+group(blade,'translate(69 40) scale(.55)'),
 va2:group(blade,'rotate(35 64 64)')+path('M79 33l9-14 11 14-10 18z','#a4b7d9')+line('M20 48l13 8-8 15m65 16 13 7-8 15','#a4b7d9',4),
 va3:group(blade,'translate(-2 3) rotate(-26 64 64)')+group(star,'translate(56 44) scale(.59)'),
 va4:line('M12 69h22l10-32 21 65 17-48 12 15h23','#abb9d8',7)+group(blade,'translate(71 -9) scale(.4)'),
 aw1:group(paw,'translate(11 14) scale(.58)')+line('M28 110c87 0 6-99 71-95','#a0bfdb',5)+group(star,'translate(76 84) scale(.3)'),
 aw2:group(cross,'translate(10 27) scale(.78)')+path('M48 48C21 29 58 15 63 5c25 19 35 37 16 50-6-24-13-26-18-29-1 10-3 16-13 22z','#e3c18c'),
 aw3:circle(64,70,45,'#92bfa833')+line('M64 24 25 92h79z','#adbde1',4)+circle(64,70,16,'#d9cea4')+line('M64 103v17M17 65H4m107 0h12'),
 aw4:group(drop,'translate(-2 -4) scale(.62)')+group(cross,'translate(56 54) scale(.62)')+line('M72 17q43 4 30 33m-69 55q-35-6-19-32','#cebb89',5),
 wr1:group(paw,'translate(6 4) scale(.8)')+group(leaf,'translate(64 68) scale(.45)'),
 wr2:group(leaf,'translate(1 4) scale(.68)')+group(cross,'translate(55 53) scale(.59)'),
 wr3:group(paw,'translate(-3 7) scale(.64)')+group(leaf,'translate(57 5) scale(.68)')+line('M28 107q41 23 77-16','#d5c397',6),
 wr4:group(leaf,'translate(-2 0) scale(.9)')+group(drop,'translate(67 63) scale(.49)'),
 rv1:group(blade,'translate(0 0) rotate(35 64 64) scale(.84)')+line('M14 29h32M7 46h25M12 63h16','#abbab2',6),
 rv2:path('M27 20h30v62l14 12-2 18H15V91l12-17z','#b79871')+group(shield,'translate(60 38) scale(.55)'),
 rv3:group(blade,'rotate(-35 64 64) scale(.9)')+group(arrow,'translate(14 1) scale(.91)'),
 rv4:group(ring,'translate(0 0) scale(.94)')+group(leaf,'translate(40 43) scale(.54)')+line('M8 88h28M4 101h32','#d8c493',4),
};

// Small steps retain category silhouettes; major nodes use distinct combinations.
Object.assign(JOB_ART, {
 f_hp:cross+line('M15 110h98','#82b58c',7),
 f_mp:drop+circle(101,20,9,'#cbd5af'),
 f_def:group(shield,'translate(16 16) scale(.75)'),
 f_atk:group(blade,'rotate(25 64 64)')+circle(26,99,10,'#dcb783'),
 f_mag:star+circle(100,102,9,'#a6c0df'),
 m_atk:blade+line('M13 108h30M20 96h22'),
 m_leech:group(blade,'rotate(-20 64 64)')+group(drop,'translate(62 55) scale(.5)'),
 p_speed:arrow+line('M10 45h35M10 64h18','#9fc2bd',6),
 p_dmg:arrow+circle(88,25,24,'#ead49444')+circle(88,25,13,'#ead49444'),
 aoe_radius:circle(64,64,32,'#91bdba33')+line('M10 64h20m68 0h20M64 10v20m0 68v20','#a4c9bb',6),
 aoe_radius2:circle(64,64,45,'#91bdba33')+circle(64,64,25,'#91bdba33')+line('M5 64h16m86 0h16','#a4c9bb',6),
 aoe_damage:circle(64,64,44,'#aabfce33')+group(star,'translate(24 24) scale(.62)'),
 aoe_master:circle(64,64,52,'#aabfce33')+star+line('M12 9h22m61 110h22','#dac089',5),
 dot_power:group(drop,'translate(10 0) scale(.8)')+line('M22 107h21m12 0h21m12 0h21','#a7ba80',7),
 dot_power2:group(drop,'translate(-3 -3) scale(.7)')+group(drop,'translate(58 39) scale(.6)'),
 lasting_time:ring+line('M64 38v28l19 14','#dfce99',6),
 dot_master:circle(64,64,48,'#ac98bf44')+group(drop,'translate(13 3) scale(.72)')+line('M13 109h102','#b9cd8f',6),
 cc_time:group(ring,'translate(11 11) scale(.82)')+line('M64 41v25l-17 15','#abcce3',6),
 cc_time2:group(ring,'translate(3 3) scale(.95)')+line('M64 33v34l24 18','#abcce3',6),
 cc_master:group(shield,'translate(8 8) scale(.84)')+line('M40 30v67m48-67v67M27 53h74M28 76h72','#c3c7e2',5),
 sup_hp:group(cross,'translate(12 12) scale(.8)')+group(leaf,'translate(65 72) scale(.4)'),
 sup_heal:group(cross,'translate(28 -3) scale(.7)')+group(drop,'translate(12 53) scale(.55)'),
 sum_mp:group(paw,'translate(-1 5) scale(.74)')+group(drop,'translate(64 56) scale(.5)'),
 sum_damage:group(paw,'translate(17 17) scale(.8)')+line('M9 7l18 19m74 75 18 18','#e0c894',6),
 mov_speed:group(arrow,'translate(-1 4) scale(.88)')+line('M10 18h33M8 34h17','#b4d2c0',5),
 mov_cd:group(ring,'translate(7 7) scale(.88)')+group(arrow,'translate(51 59) scale(.43)'),
});


// The extended profession exercises use their effect illustration and visible section marks.
const practiceArt={vanguard:[blade,shield,shield,blade,drop,shield],arcanist:[star,drop,drop,ring,eye,shield],warden:[cross,shield,cross,paw,ring,drop],ranger:[arrow,arrow,eye,ring,cross,eye]};
const practiceColours={vanguard:'#ea9b51',arcanist:'#9480e4',warden:'#58bf93',ranger:'#62bccc'};
for(const [branch,illustrations] of Object.entries(practiceArt))for(let tier=2;tier<=6;tier++)for(let row=0;row<6;row++) {
 const ticks=Array.from({length:tier-1},(_,i)=>circle(28+i*18,113,3.5,practiceColours[branch])).join('');
 JOB_ART[`${branch}_t${tier}_${row+1}`]=circle(64,61,49,practiceColours[branch]+'22')+group(illustrations[row],`translate(${row-3} ${tier-3}) scale(.82) rotate(${(tier-2)*3+row} 64 64)`)+ticks;
}

// Element schools share their silhouette, with distinct rank compositions.
const elementArt={
 physical:[blade,'#c9ced4'],
 fire:[path('M63 15c2 25 31 33 29 62-1 29-48 40-61 12-10-21 9-42 20-48l-2 27c15-10 19-31 14-53z','#efa054')+path('M64 63c13 16 21 28 4 40-25-1-26-21-4-40z','#ffe0a0'),'#efa054'],
 cold:[line('M64 17v86M27 37l74 44M27 81l74-44M50 23l14 14 14-14M50 97l14-14 14 14M26 51l17 2-7-17M102 67l-17-2 7 17','#a5dcea',7),'#a5dcea'],
 lightning:[path('M70 12 28 67h31l-7 45 47-64H69l13-36z','#f2d779'),'#f2d779'],
 earth:[path('M22 86 37 47l29-20 30 29 14 33-42 17z','#b9a176')+line('M37 47 68 67l28-11M68 67v39','#f2d5a6',5),'#b9a176'],
 poison:[group(drop,'translate(13 1) scale(.8)')+path('M28 99q33-13 74 0l-7 13H35z','#93bd73')+circle(92,29,8,'#bfe096'),'#93bd73'],
};
for(const [element,[shape,colour]] of Object.entries(elementArt))for(let rank=1;rank<=3;rank++) {
 const composition=rank===1?group(shape,'translate(12 8) scale(.8)'):rank===2?circle(64,64,48,colour+'22')+group(shape,'translate(5 0) scale(.9)'):group(shape,'translate(-1 -3)')+line('M21 110h86M23 23l-7-7m89 7 7-7',colour,5);
 JOB_ART[`element_${element}_${rank}`]=composition+Array.from({length:rank},(_,i)=>circle(47+i*17,117,3,colour)).join('');
}

// Shared mana route: reservoir, breathing rhythm and careful casting.
Object.assign(JOB_ART, {
 mana_pool_1:group(drop,'translate(14 7) scale(.8)')+path('M19 97h90v15H19z','#a6b8d0'),
 mana_flow_1:group(drop,'translate(34 9) scale(.55)')+line('M17 89q47 24 95 0M25 106q40 18 76 0','#aacbdf',6),
 mana_pool_2:path('M22 48h84l-8 60H30z','#9db6d0')+group(drop,'translate(38 -8) scale(.45)')+line('M34 83h61','#d9dfb5',5),
 mana_flow_2:group(ring,'translate(6 6) scale(.9)')+group(drop,'translate(36 25) scale(.48)'),
 mana_efficiency:group(drop,'translate(8 6) scale(.72)')+line('M74 44h39M83 59h24M80 77l13 13 22-31','#a9c5da',6),
 mana_reservoir:path('M21 21h86v86l-43 12-43-12z','#859db7')+group(drop,'translate(33 31) scale(.49)')+line('M34 89h60','#d5d3a7',5),
 mana_cycling:group(ring,'rotate(50 64 64)')+group(drop,'translate(27 24) scale(.58)')+circle(20,66,6,'#aecddf'),
 mana_master:circle(64,64,51,'#91bcd333')+group(drop,'translate(17 -1) scale(.76)')+line('M12 109h104M17 22h22m50 0h22','#d9ca92',6),
});
