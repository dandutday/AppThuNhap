# 🐷 Heo Đất – Sổ thu chi

Web quản lý **thu nhập và chi tiêu** viết bằng HTML, CSS và JS thuần, không cần build. Có số dư, tỷ lệ tiết kiệm, ngân sách chi, mục tiêu thu, biểu đồ thu – chi và cơ cấu theo danh mục.

> **Nâng cấp từ bản chỉ có thu nhập:** chạy lại `supabase/schema.sql` một lần để thêm cột `type` và `budget`. Dữ liệu cũ được giữ nguyên và tự thành khoản thu.

- **Chưa đăng nhập**: dữ liệu lưu trong trình duyệt (localStorage).
- **Đăng nhập**: dữ liệu lưu trên **Supabase** (Postgres), dùng được trên nhiều thiết bị.

## Cấu trúc thư mục

```
AppThuNhap/
├── index.html
├── README.md
├── supabase/
│   └── schema.sql            # tạo bảng + phân quyền RLS (chạy 1 lần)
└── assets/
    ├── css/
    │   ├── theme.css         # màu sắc, font, sáng/tối
    │   ├── layout.css        # bố cục, responsive
    │   ├── components.css    # nút, thẻ, biểu đồ, hộp thoại…
    │   └── mobile.css        # giao diện điện thoại (tab đáy, nút +, bottom sheet)
    ├── js/
    │   ├── supabase-config.js  # ⚙️ điền URL + anon key
    │   ├── icons.js          # bộ icon SVG
    │   ├── utils.js          # định dạng tiền, ngày tháng
    │   ├── cloud.js          # gọi Supabase (đăng nhập + đọc/ghi)
    │   ├── store.js          # lớp dữ liệu: localStorage ↔ Supabase
    │   ├── charts.js         # biểu đồ SVG
    │   └── app.js            # giao diện và sự kiện
    └── img/favicon.svg
```

## Kết nối Supabase (khoảng 5 phút)

1. Tạo tài khoản và một project miễn phí tại https://supabase.com.
2. Vào **SQL Editor → New query**, dán toàn bộ `supabase/schema.sql` rồi bấm **Run**.
3. Vào **Project Settings → API** (hoặc nút **Connect**), copy:
   - **Project URL**
   - **anon public key** (hoặc publishable key `sb_publishable_…`)

   Dán vào `assets/js/supabase-config.js`.
   ⚠️ **Không** dùng `service_role` / secret key.
4. Vào **Authentication → URL Configuration**:
   - **Site URL**: địa chỉ bạn mở web, ví dụ `http://localhost:5500` hoặc tên miền thật.
   - **Redirect URLs**: thêm địa chỉ đó (cần cho link xác nhận email, đặt lại mật khẩu, đăng nhập Google).
5. (Tuỳ chọn) Dùng một mình và không muốn phải xác nhận email: **Authentication → Sign In / Providers → Email**, tắt **Confirm email**.
6. (Tuỳ chọn) Đăng nhập Google: **Authentication → Sign In / Providers → Google**, bật lên và điền Client ID/Secret tạo từ Google Cloud Console.

## Chạy web

Đăng nhập email chạy được khi mở thẳng file `index.html`. Riêng **link xác nhận email** và **đăng nhập Google** cần chạy trang qua `http://`:

- VS Code: cài extension **Live Server** → chuột phải `index.html` → *Open with Live Server* (mặc định `http://127.0.0.1:5500`).
- Hoặc dùng lệnh: `npx serve .` hay `python -m http.server 5500`.

Đưa lên mạng miễn phí: Netlify, Vercel, Cloudflare Pages hoặc GitHub Pages (chỉ cần upload thư mục này). Nhớ thêm tên miền vào Site URL / Redirect URLs.

## Ghi chú

- Lần đầu đăng nhập, nếu máy đang có dữ liệu thì app hỏi có muốn tải lên tài khoản không. Trong **Cài đặt** cũng có nút để làm việc này.
- Thay đổi từ thiết bị khác sẽ hiện khi bạn quay lại tab, hoặc khi bấm **Tải lại dữ liệu**.
- Gói miễn phí của Supabase tạm dừng project nếu khoảng 1 tuần không có truy cập. Vào Dashboard bấm **Restore** là dùng lại được, dữ liệu không mất.
- Vẫn nên thỉnh thoảng **Sao lưu JSON** trong Cài đặt.
