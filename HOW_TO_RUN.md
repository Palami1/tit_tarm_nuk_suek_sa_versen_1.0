# ຄຳແນະນຳວິທີຕິດຕັ້ງ ແລະ ເປີດໃຊ້ງານລະບົບ (Intern System)

ລະບົບນີ້ພັດທະນາດ້ວຍ **Next.js + React + Tailwind CSS + Firebase**.

---

### 1. ສິ່ງທີ່ຕ້ອງມີໃນເຄື່ອງ (Prerequisites)
- **Node.js** (ແນະນຳເວີຊັນ 18 ຂຶ້ນໄປ ຫຼື 20+)
  - ກວດສອບໄດ້ໂດຍການພິມ: `node -v` ໃນ Terminal / CMD
  - ຖ້າຍັງບໍ່ມີ ສາມາດດາວໂຫຼດໄດ້ທີ່: https://nodejs.org

---

### 2. ຂັ້ນຕອນການເປີດໃຊ້ງານ (Step-by-step Setup)

1. **ແຕກໄຟລ໌ Zip (Extract Zip):**
   - ແຕກໄຟລ໌ອອກມາໄວ້ໃນເຄື່ອງ

2. **ເປີດ Terminal / PowerShell / Command Prompt:**
   - ເຂົ້າໄປຍັງໂຟນເດີ `intern-system`

3. **ຕິດຕັ້ງໂປຣແກຣມທີ່ຈຳເປັນ (Install Dependencies):**
   ```bash
   npm install
   ```
   *(ລໍຖ້າໃຫ້ລະບົບດາວໂຫຼດ node_modules ສຳເລັດ)*

4. **ເປີດໃຊ້ງານລະບົບ (Start Development Server):**
   ```bash
   npm run dev
   ```

5. **ເຂົ້າໃຊ້ງານຜ່ານ Web Browser:**
   - ເປີດ browser ແລ້ວເຂົ້າໄປທີ່:
   ```
   http://localhost:3000
   ```

---

### 3. ລາຍລະອຽດບັນຊີ ແລະ ຖານຂໍ້ມູນ
- ລະບົບເຊື່ອມຕໍ່ກັບ Firebase Cloud Firestore ຮຽບຮ້ອຍແລ້ວໃນ `src/lib/firebase.ts`
- ບໍ່ຈຳເປັນຕ້ອງຕັ້ງຄ່າ `.env` ເພີ່ມເຕີມ ສາມາດ `npm install` ແລ້ວ `npm run dev` ໄດ້ເລີຍ.
