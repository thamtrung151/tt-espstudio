# TT ESPStudio — Web + Local Agent preview

Định hướng hiện tại: website online + Agent Windows biên dịch/nạp trên máy người dùng. Xem [hướng dẫn Pages và Agent](docs/web-agent.md) và [API v1](docs/agent-api.md).

`npm run build:web` tạo web online ở `dist-web`; `Start-ESPStudio-Agent-Dev.cmd` chạy Agent preview bằng PlatformIO của máy phát triển. Bộ cài `.exe` tự thiết lập toolchain chưa phát hành. `Start-ESPStudio.cmd` vẫn giữ luồng localhost để kiểm tra hồi quy.

**Bản chính:** `C:\Users\VICTUS\TT ESPStudio`. Thư mục `.tt-espstudio-staging` giữ bản 0.2.1 để tham khảo; source mới và launcher nằm ở thư mục chính.

**GPIO do người dùng quyết định:** không có whitelist hoặc khóa GPIO theo board mẫu. Nhập chân theo sơ đồ board của bạn; boot/flash/PSRAM/USB/UART/input-only/ADC và dùng chung chân chỉ hiện thông tin tham khảo, không chặn áp dụng/build/nạp. Danh sách GPIO có thể trống hoặc tự bổ sung; thiết bị vẫn dùng đúng chân đã nhập. Đổi chip không tự thay danh sách chân của bạn.

Phạm vi số chân trong file là số nguyên 0–255 để biểu diễn bằng `uint8_t`, không phải danh sách chân có thật trên chip. Validator vẫn kiểm tra cấu trúc dữ liệu, ID thiết bị, giá trị lệnh và cấp phát timer. Chức năng thực tế của chân vẫn do phần cứng quyết định.

Platform web robotics STEAM cho ESP32: **Configuration → Blockly → Arduino C++ → biên dịch → nạp firmware**. Cấu hình và project cũ 0.1 vẫn đọc được; không dùng MicroPython.

## Mở bản cập nhật

1. Đóng terminal đang chạy bản cũ (Ctrl+C).
2. Chạy `Start-ESPStudio.cmd` trong thư mục này.
3. Mở **http://127.0.0.1:3210**, tải lại trang. Project đang lưu trong trình duyệt được giữ nguyên.

Hoặc chạy `npm start` nếu đã có dist mới. Giao diện 0.2.1 báo cần restart khi bridge còn bản cũ để tránh áp dụng validator GPIO cũ.

Cài trên máy mới: Node 22.12+ và PlatformIO Core, sau đó `npm ci`, `npm run build`, `npm start`. Bridge tìm PlatformIO trong `~/.platformio/penv`, PATH hoặc đường dẫn executable từ biến `ESPSTUDIO_PIO`. Build đầu tiên có thể cần tải toolchain. Bản này dùng PlatformIO espressif32 6.12.0 / Arduino core 2.0.17.

## Sửa GPIO2 cho LED onboard DOIT

GPIO2 đã được cho phép. Với project đang dùng:
- Thêm **2** vào danh sách GPIO được đưa ra cổng nếu chưa có.
- Đổi chân của LED thành **2**, bấm **Áp dụng cấu hình GUI**.
- Lưu ý màu vàng về strapping là thông tin về reset/boot, không phải lỗi chặn build.
- Biên dịch và nạp lại; đổi active-low nếu cực tính LED thực tế yêu cầu.

Hoặc mở ví dụ **DOIT · LED onboard GPIO2** trong Lập trình. Khi mở ví dụ/project mới, app tải một bản sao project đang mở trước khi thay thế. Không tự nạp thiết bị.

GPIO2 có ảnh hưởng chế độ boot khi reset; đây không phải lý do cấm dùng GPIO2 như GPIO sau khi khởi động. [Nguồn Espressif](https://docs.espressif.com/projects/esp-idf/en/v5.1/esp32/api-reference/peripherals/gpio.html).

## Chức năng lõi hiện có

| Thiết bị | Configuration | Blockly |
| --- | --- | --- |
| GPIO output | Chân, active-low | Bật/tắt |
| GPIO input | Chân, pull none/up/down, active-low | Đọc Serial, điều kiện nếu/thì/nếu không |
| ADC input | Chân ADC, suy hao 0/2.5/6/11 dB | Đọc raw 12-bit (0–4095), so sánh ngưỡng |
| PWM output | Chân, tần số 1–20000 Hz | Duty 0–100%, độ phân giải 8-bit |
| Servo thông thường | Chân, xung min/max; mặc định 1000–2000 µs | Góc danh định 0–180°, ngừng xung; 50 Hz |
| Motor cầu H **hai PWM IN1/IN2** | Chỉ IN1, IN2, tần số, đảo chiều | Duty có dấu -100…100%, chạy 1–10000 ms rồi dừng |

Motor không có chân PWM thứ ba. Các thiết bị đều tùy chọn: chọn **Board trống** để bắt đầu không có thiết bị; chỉ khi thêm motor/servo mới cần nhập chân. Chân mới để trống, không tự đoán pinout. Các thông tin flash/PSRAM, input-only và UART0 là tham khảo; Studio không cấm bạn chọn các chân đó.

Ví dụ **DOIT · Nút nhấn + ADC** dùng nút GPIO27 xuống GND (pull-up nội), cảm biến analog ở GPIO34 và LED GPIO2. ADC chỉ nhận điện áp trong giới hạn chip; giá trị raw không phải số volt hiệu chuẩn. Không có debounce tự động cho nút nhấn.

Giao diện tự phân bổ LEDC theo tần số/độ phân giải, kiểm tra hết tài nguyên và tránh để servo 50 Hz đổi timer của motor. Xem chi tiết [driver và dạng cấu hình](docs/config-format.md).

## Lưu chương trình và làm việc với code

Blockly là nguồn trong block mode. C++ tự do khóa Blockly/Configuration; quay về block giữ bản C++ và config trong lịch sử. Không chuyển C++ ngược thành block hoặc âm thầm ghi đè code. Có autosave localStorage, xuất/nhập config, project đầy đủ, lịch sử C++ và ZIP PlatformIO.

Các nhóm block: Chương trình, GPIO & cảm biến, PWM & chuyển động, Serial. Chọn block để chọn đoạn C++ tương ứng; không phải debug thực thi. Code editor chưa có IntelliSense.

## Build, nạp và Serial

Build qua PlatformIO cục bộ. Trong Thiết bị: quét cổng, chọn đúng ESP32, nạp firmware. Serial monitor dùng Web Serial trên Chrome/Edge ở 115200 baud, đóng trước upload. Build cũ không được nạp nếu config/code đã thay đổi.

Chủ dự án đã xác nhận **build/nạp/Serial** trên DOIT ESP32 DevKit, COM6 (CP210x), và sau đó báo thử cả **ESP32 lẫn ESP32-S3 đều hoạt động**. Chưa có bảng xác nhận riêng từng model S3, driver và ngoại vi; không suy diễn rằng mọi motor/servo/ADC đã được thử.

Driver motor dùng IN1 = PWM, IN2 = 0 cho chiều dương; IN1 = 0, IN2 = PWM cho chiều âm; dừng đưa cả hai về 0. IC phải hỗ trợ cách điều khiển này; chế độ phanh/thả phụ thuộc IC. Block motor hiện **chạy tuần tự và chờ hết thời gian**, chưa điều khiển nhiều motor đồng thời. Khoảng ngắt 50 µs trước đổi chiều không thay thế việc chọn driver, bảo vệ dòng hoặc kiểm chứng tải thực tế.

Servo chưa có phản hồi góc. Dải xung phải phù hợp servo; lúc setup không phát xung, đến block Servo mới bắt đầu. Ngừng xung không đồng nghĩa cơ cấu tự giữ vị trí. Servo/motor dùng nguồn và driver phù hợp, chung GND với ESP32.

## Phát triển và kiểm tra

- `npm test`: schema, pin capabilities, generator, serialization, code history, LEDC và motor hai PWM.
- `npm run build`: TypeScript + Vite.
- `npm run test:browser`: Edge headless trên bridge riêng **3211**, không đụng phiên người dùng ở 3210.
- `$env:ESPSTUDIO_TEST_FIRMWARE = '1'` rồi `npm run test:browser`: thêm build thật chương trình có toàn bộ driver qua UI/API/PlatformIO. Không nạp USB.
- `npm run firmware:example`: sinh ví dụ Blink từ Blockly.
- `npm run firmware:robotics`: sinh `examples/robotics` và project JSON có đủ driver để kiểm chứng. Pin trong ví dụ là pin kiểm thử, phải đối chiếu dây trước khi nạp; có lệnh chuyển động motor/servo.
- Hot reload: `npm start` + terminal khác chạy `npm run dev`, mở 5173. Project trên 5173 và 3210 là hai localStorage khác nhau.

Bridge chỉ chạy loopback cho máy cá nhân tin cậy. Không triển khai compiler này public cho người lạ. Có thể đặt `ESPSTUDIO_PORT` nếu cần đổi cổng. Job chạy tuần tự, timeout 5 phút, lưu source/artifacts trong `.builds`, chưa tự dọn hoặc cancel UI. Restart bridge yêu cầu build lại để nạp.

ESP32 và ESP32-S3 đã có phản hồi hoạt động từ chủ dự án. Thông tin pinout WROOM/DevKitC chỉ để gợi ý, không áp làm giới hạn cho board khác. Dùng chung GPIO được thông báo để người dùng quyết định; chưa có driver bus I2C/SPI. Chưa có encoder, điều khiển motor đồng thời, AI/MCP, online storage, mobile USB hoặc cloud build.

Tên/giấy phép/phát hành chưa chốt. [Kiến trúc](docs/architecture.md) · [Kiểm chứng](docs/verification.md) · [Lộ trình](docs/roadmap.md).

