import './online-gate.css';
export function createOnlineGate(client) {
  const root = document.createElement('section');
  root.className = 'online-gate'; root.setAttribute('aria-label', 'Online connection');
  root.innerHTML = `<div class="online-card"><p class="online-brand">SEEKER · ONLINE</p><h1></h1><p data-detail></p><output role="status" aria-live="polite"></output><button type="button" data-retry>ลองใหม่ / Retry</button><p class="online-note">ทดลองออนไลน์ · การโจมตีและสกิลที่เห็นเป็นภาพร่วมกัน<br>มอนสเตอร์ ความเสียหาย ไอเทม และเซฟยังแยกกัน</p><a href="./offline.html">Developer / Offline · เซฟในเครื่องและเครื่องมือ</a></div>`;
  document.body.append(root);
  const texts = {
    connecting: ['Connecting · กำลังเชื่อมต่อ', 'เชื่อมต่อเซิร์ฟเวอร์ก่อนสร้างโลก · ครั้งแรกอาจใช้เวลาสักครู่'],
    joining: ['Connecting · กำลังเข้าห้อง', 'รอเซิร์ฟเวอร์ยืนยันห้อง · การเล่นหยุดชั่วคราว'],
    reconnecting: ['Reconnecting · กำลังเชื่อมต่อใหม่', 'การเล่นหยุดชั่วคราว · กำลังกลับเข้าห้องเดิม'],
    failed: ['Failed · เชื่อมต่อไม่ได้', 'ตรวจสอบการเชื่อมต่อ แล้วกดลองใหม่เพื่อเข้าออนไลน์'],
    solo: ['Failed · ขาดการเชื่อมต่อ', 'กดลองใหม่เพื่อกลับเข้าออนไลน์'],
  };
  const update = status => {
    root.hidden = client.connected && (!client.requiresRoomAck || !!client.id);
    document.body.classList.toggle('online-gated', !root.hidden);
    const [title, detail] = texts[status] || texts.reconnecting;
    root.querySelector('h1').textContent = title;
    root.querySelector('[data-detail]').textContent = detail;
    root.querySelector('output').textContent = client.endpoint ? 'Experimental online visual prototype' : 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ / Server is not configured';
    root.querySelector('[data-retry]').hidden = !['failed', 'solo', 'reconnecting'].includes(status);
  };
  const off = client.subscribe('status', update);
  root.querySelector('[data-retry]').onclick = () => client.retryNow();
  update(client.status);
  return { get blocked() { return !client.connected || (!!client.requiresRoomAck && !client.id); }, dispose() { off(); root.remove(); document.body.classList.remove('online-gated'); } };
}
