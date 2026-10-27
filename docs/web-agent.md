# Web online + Windows Agent — preview 0.3

Website chính là web tĩnh. PlatformIO và USB chạy trên máy người dùng. Không có compiler cloud hoặc yêu cầu máy của chủ dự án luôn bật.

## Mốc hiện tại

- Giữ frontend Vite/TypeScript và backend Node hiện có. Không chuyển sang React/Python hoặc viết lại editor.
- `npm start` / `Start-ESPStudio.cmd`: luồng localhost cũ, dùng dist và bridge 3210.
- `npm run build:web`: web tĩnh ở dist-web, gọi Agent tại 127.0.0.1:3217.
- `npm run agent:dev`: Agent độc lập. `Start-ESPStudio-Agent-Dev.cmd` cho phép dùng PlatformIO sẵn có trên máy phát triển bằng ESPSTUDIO_AGENT_DEV=1.
- Chưa có bộ cài .exe cho học sinh, chưa có tự cập nhật. Không hướng dẫn người dùng cuối cài Node/Python bằng tay như một sản phẩm hoàn chỉnh.
- Agent thường (không DEV) chỉ tìm Python/PlatformIO trong `%LOCALAPPDATA%\TTESPStudio\agent`, không tự dùng môi trường toàn cục. Bootstrap riêng sẽ thực hiện ở bước bộ cài.

## Thử trên máy phát triển

1. Mở `Start-ESPStudio-Agent-Dev.cmd`. Giữ cửa sổ này mở; đây là UI ghép nối tạm thời của preview.
2. Build web: `npm run build:web`. Xem bản tĩnh bằng Vite preview hoặc website HTTPS đã xuất bản.
3. Agent chỉ cho phép origin chính xác trong biến `ESPSTUDIO_AGENT_ORIGINS`, phân cách bằng dấu phẩy. Với GitHub Pages, origin là `https://thamtrung151.github.io` (không có đường dẫn repo).
4. Website: **Kết nối compiler → Yêu cầu ghép nối**. Agent in địa chỉ website và mã 8 chữ số. Chỉ nhập mã nếu chính bạn vừa yêu cầu ở đúng website đó.
5. Ghép nối thành công → chọn cấu hình → build → quét cổng → chọn board → nạp. Nạp vẫn yêu cầu thao tác và xác nhận riêng.
6. Mỗi phiên có hiệu lực 8 giờ. Đóng tab xóa sessionStorage; khởi động lại Agent thu hồi toàn bộ phiên. Nút ngắt ghép nối thu hồi phiên hiện tại.

Ví dụ PowerShell cho trang online (thiết lập chỉ trong terminal này):

```powershell
$env:ESPSTUDIO_AGENT_DEV = '1'
$env:ESPSTUDIO_AGENT_ORIGINS = 'https://thamtrung151.github.io,http://127.0.0.1:5173'
npm run agent:dev
```

Không có Agent: vẫn sửa/lưu/nhập/xuất Blockly, C++ và config; không có build/nạp giả. Project localhost không tự chuyển sang HTTPS: xuất file JSON rồi nhập tại website mới.

## GitHub Pages dành cho chủ dự án

Repo dự kiến: `thamtrung151/tt-espstudio`. URL dự kiến: `https://thamtrung151.github.io/tt-espstudio/`.

1. Repo → **Settings → Pages**.
2. **Build and deployment → Source → GitHub Actions**.
3. Tab **Actions → Publish ESPStudio web preview**: theo dõi build/deploy; có thể chạy bằng **Run workflow** trên nhánh main.
4. Chờ deploy xanh rồi mở địa chỉ ở Settings → Pages. Nếu trang 404, kiểm tra workflow và base `/tt-espstudio/`, không sửa bằng cách đưa backend lên Pages.

Workflow `.github/workflows/pages.yml` chạy unit/API tests, build web tĩnh và deploy. Actions không nhận build firmware của khách truy cập. Build/nạp firmware thuộc Agent trên máy khách.

## Quy trình nâng cấp

Sửa trên nhánh tính năng → test localhost + Agent → commit/push → review → merge main → Actions xuất bản web. Không sửa file dist bằng tay. Để rollback, revert commit lỗi và deploy lại.

Source chính ở gốc TT ESPStudio; staging cũ là bản tham khảo 0.2.1, không tiếp tục phát triển song song. File hội thoại, ảnh người dùng, output/MATLAB, PS2 chưa tích hợp và backups không thuộc lần xuất bản này.

Web version và Agent version tách biệt; hợp đồng hiện là API v1. Thay đổi UI không buộc cài Agent mới. Thay đổi thư viện/toolchain/API cần kiểm tra khả năng Agent, cập nhật gói được ghim phiên bản. Chưa có installer/release URL chính thức cho preview.

## Kiểm chứng còn phải làm trước phát hành rộng

- Kết nối từ HTTPS thật trên Chrome và Edge, bao gồm quyền Local/Loopback Network Access khi hỏi/cho phép/từ chối. Không hướng dẫn tắt bảo mật browser.
- Nạp thật từ website qua Agent trên board người dùng, đối chiếu COM và firmware; thử bận cổng/rút USB.
- Bộ cài tự chứa runtime, tải toolchain ghim phiên bản, sửa/cài lại, thử Windows sạch không Node/Python/PlatformIO/VS Code.
- UI ghép nối/thoát bằng cửa sổ/tray thay terminal, khởi động cùng Windows tùy chọn.
- Chuyển Serial monitor sang Agent hoặc thiết kế quyền sở hữu cổng thống nhất. Preview vẫn giữ Web Serial cũ và đóng kết nối đó trước upload; tab/app khác có thể giữ cổng.
- Dọn cache có giao diện, kiểm tra dung lượng. Preview chặn sau 30 thư mục build, tối đa 100 job trong phiên; người phát triển dọn builds khi Agent đã tắt. Không tự xóa project người dùng.
- Chốt giấy phép phần mềm và phân phối dependencies trước khi phát hành bộ cài rộng rãi.

GitHub Pages dùng origin cấp tài khoản: các repo Pages khác trên cùng origin không được coi là ranh giới bảo mật riêng. Chỉ lưu nội dung tin cậy trên origin đó; cân nhắc tên miền riêng trước phát hành rộng.
