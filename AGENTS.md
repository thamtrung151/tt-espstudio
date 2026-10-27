# Hướng dẫn làm việc với TT ESPStudio

- Định hướng mới: web tĩnh GitHub Pages + Windows Local Agent, không cloud compiler/WASM/Electron. Đọc docs/web-agent.md và docs/agent-api.md. Giữ backend Node hiện có; không bắt buộc đổi sang Python.
- Source chính nằm ở gốc; staging cũ giữ làm tham khảo 0.2.1. Không nhân đôi nhánh phát triển mới sang staging. Chỉ stage source sản phẩm được chọn, không `git add .` vì thư mục có tài liệu cá nhân/output/nguồn thư viện chưa tích hợp.
- API Agent v1 dùng pairing theo origin và token phiên. Không hạ Origin/Host/CORS để trang online kết nối. `ESPSTUDIO_AGENT_DEV=1` chỉ dành thử nghiệm với PlatformIO đã cài; không coi đó là installer hoàn thiện.

- Nguồn làm việc chính là `C:\Users\VICTUS\TT ESPStudio`; `.tt-espstudio-staging` đã được người dùng chuyển về bên trong cây dự án. Không tạo staging trong project micromouse. Khi cần staging do sandbox, dùng thư mục tạm của hệ điều hành rồi bàn giao vào đúng dự án.
- Chỉ đạo mới nhất của chủ dự án: **freely use GPIO, không khóa chân theo whitelist board/chip**. Target pin tables chỉ để đưa thông tin tham khảo. Không phục hồi các hard-error GPIO của 0.1/0.2. Được kiểm tra định dạng/số nguyên và tài nguyên generator; pin input-only, ADC, Serial, USB, flash hoặc dùng chung đều không phải cổng chặn áp dụng/build/nạp.
- Người dùng đã báo ESP32 và ESP32-S3 đều hoạt động. Không suy diễn rằng đã kiểm chứng từng ngoại vi hoặc tất cả board ESP32.

- Xác nhận mới nhất: board DOIT ESP32 DevKit; người dùng đã build/nạp/Serial thành công qua COM6 CP210x. GPIO2 dùng cho LED onboard theo người dùng.
- Driver motor thực hiện là **hai tín hiệu IN1/IN2, cả hai PWM** (`motor.hbridge2`). Không đổi thành ba chân hoặc bắt khai báo motor trên board trống. Servo loại thông thường, dải xung có cấu hình.
- Driver mới 0.2 đã compile và test UI, chưa được người dùng xác nhận chạy phần cứng. Đọc phần cập nhật 0.2 đầu docs trước các giới hạn lịch sử 0.1.

- Đọc `Robotics_STEAM_Platform_Agent_Brief.md`, sau đó `docs/architecture.md`, `docs/verification.md` và `docs/roadmap.md`.
- Lịch sử hội thoại có ý tưởng cũ. Quyết định cuối: C++ + Blockly, không MicroPython; Configuration là nền tảng, GUI/JSON cùng mô hình.
- Giữ nguyên source ownership. Code mode không tự sinh lại code; không ghi đè manual C++; luôn giữ snapshot và history có config.
- Không đoán pinout, driver motor hoặc tuyên bố hỗ trợ phần cứng chỉ từ build thành công. ESP32 DevKit/WROOM là board đầu tiên đã chọn.
- Build/upload phải là thao tác thật với trạng thái/log riêng. Không tự nạp thiết bị trong lúc kiểm thử phần mềm.
- Dùng cùng schema ở frontend/server. Driver mới cần mô hình tài nguyên phù hợp; không áp dụng quy tắc output-exclusive cho bus dùng chung.
- `npm test` và `npm run build` cho thay đổi core; `npm run test:browser` cho luồng editor/persistence. Ca build firmware thật là opt-in bằng `ESPSTUDIO_TEST_FIRMWARE=1`.
- Ghi thay đổi quyết định/phạm vi và bằng chứng mới vào docs. Không coi prototype là sản phẩm hoàn chỉnh, chưa chọn giấy phép, chưa triển khai online/AI.
