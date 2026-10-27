# Các mốc tiếp theo

## Chốt bổ sung 0.2.1

- Người dùng báo thử thành công ESP32 và S3; mở lựa chọn GPIO theo board bất kỳ, không khóa theo whitelist.
- Pin metadata trở thành thông tin hỗ trợ. Board config do người dùng quyết định; không tự thay danh sách pin khi chuyển target.
- Từ đây phát triển trên source ở gốc TT ESPStudio. Staging trong cây dự án được giữ làm bản sao; không còn dùng cây micromouse.

## Cập nhật sau 0.2

- Đã có xác nhận từ chủ dự án: build/nạp/Serial trên DOIT ESP32 DevKit, COM6 CP210x.
- Đã sửa GPIO2; thêm GPIO input, ADC, PWM, servo thường, motor **hai PWM IN1/IN2**, các block đọc/điều kiện/chuyển động và allocator LEDC.
- Board trống không có thiết bị bắt buộc. Motor/servo chỉ thêm khi cần, không đoán chân.
- Bước kiểm chứng tiếp: LED GPIO2 → nút GPIO27 + ADC GPIO34 → PWM → servo → motor, đối chiếu pin và dải xung/thông số driver thực trước khi nạp.
- Mốc tiếp: motor không blocking và chạy hai bên đồng thời, watchdog độc lập, encoder/điều khiển tốc độ, debounce, I2C sensor. Motor hiện chạy tuần tự theo thời gian rồi dừng; chưa gọi đây là bộ điều khiển robot hoàn chỉnh.
- Tiếp tục mở rộng board/driver dựa trên sơ đồ thật. Giữ các mục online/AI sau nền móng và kiểm chứng phần cứng.

Lộ trình ban đầu được giữ bên dưới để tham chiếu; các đầu việc đã hoàn thành được đánh dấu ở phần cập nhật này.

## Đang bàn giao — 0.1

Config GUI/JSON, Blockly thật, C++, lưu/nhập project và code history, xuất PlatformIO, local build/upload, Serial. Board đầu tiên do người dùng chọn: ESP32 DevKit / WROOM. Không tự nạp vào thiết bị khi chưa xác nhận cổng và kết nối.

## Mốc 1 — Xác nhận trên board thật

- Xác nhận model/module DevKit, cổng COM và cách nối LED ngoài.
- Nạp từ giao diện, kiểm tra nháy LED, reset và chạy độc lập khi đóng web.
- Kiểm tra đọc Serial, rút USB, cổng bận, lỗi nạp/BOOT.
- Ghi board/module/driver USB, sơ đồ và kết quả vào bảng hỗ trợ phần cứng.

## Mốc 2 — Robotics thực tế

- Nhận sơ đồ board robotics, loại cầu H, pinout, điện áp/nguồn và servo từ chủ dự án.
- Thêm driver GPIO input, motor cầu H cụ thể, servo PWM; giới hạn đơn vị/range/timer rõ ràng.
- Tách driver registry và schema options; mô hình tài nguyên dùng chung cho bus/PWM.
- Block chọn thiết bị theo loại; hành vi dừng motor và timeout phải được thử trên phần cứng.
- Chứng minh đổi sang board thứ hai chỉ qua config với các driver đã có.

## Mốc 3 — Trải nghiệm nền tảng

- Code editor với syntax highlighting/completion và diagnostics liên kết block.
- Template board có manifest build, flash/PSRAM và pin capabilities có nguồn kiểm chứng.
- Library driver, tài khoản, lưu online/chia sẻ; chốt giấy phép, tên và mô hình vận hành.
- Đề xuất riêng cho cloud build: isolate compiler, queue, quota, artifact ownership.
- AI API: đọc trạng thái, highlight, đề xuất diff rồi áp dụng; quyết định provider/key/budget sau.
- Điện thoại và Web Serial/WebUSB đánh giá theo từng OS/browser; chưa cam kết.
