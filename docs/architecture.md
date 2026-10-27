# Các lựa chọn triển khai ban đầu — 27/10/2026

## Quyết định 0.2.1 — quyền chọn GPIO thuộc người dùng

Theo yêu cầu trực tiếp mới nhất, không dùng bảng pinout mẫu làm whitelist. GPIO được nhập tự do trong miền số uint8_t (0–255), exposedPins là dữ liệu mô tả/gợi ý của người dùng; không bắt thiết bị nằm trong danh sách mẫu hay danh sách này. Đổi target không tự viết lại danh sách GPIO. Metadata chip/module, pin dùng chung và xung đột UART/USB/ADC/input-only chỉ sinh ghi chú qua configWarnings, không chặn GUI, generator, build API hoặc upload.

Validator tiếp tục kiểm tra cấu trúc dữ liệu, ID duy nhất, kiểu driver, giới hạn lệnh, dải xung và tài nguyên LEDC để generator có thể tạo chương trình. Cho phép chọn chân không hứa chân đó có chức năng vật lý tương ứng. Schema version vẫn 1, project cũ giữ nguyên.

Mã nguồn 0.2 trước đây nằm trong staging, trong khi thư mục chính còn 0.1. Bản 0.2.1 được bàn giao về thư mục chính và đồng bộ staging để tránh mở nhầm phiên bản. Tài liệu các phiên bản cũ phía dưới là lịch sử; quy tắc tự chọn GPIO ở đây thay thế toàn bộ hard gate GPIO cũ.

## Cập nhật 0.2

Pin profile tách GPIO tồn tại, input-only, pull, ADC1/ADC2, strapping và UART0. GPIO2 được sử dụng với lưu ý reset; không còn chỉ whitelist output thận trọng của 0.1. Mô hình vẫn có tập chân đưa ra trên board để giới hạn theo sơ đồ thật.

Schema driver là discriminated union: GPIO output/input, ADC input, PWM output, servo PWM, motor.hbridge2. Registry ở `src/core/drivers.ts`. Motor theo xác nhận cuối của người dùng: IN1 và IN2 **đều dùng PWM**, hai pin/two LEDC channels, không có pin PWM riêng. Board phát triển mặc định không ép khai báo motor; form chỉ yêu cầu chân sau khi thêm thiết bị.

LEDC allocator biết adjacent channels share timer trong Arduino core 2.0.17. Ghép chỉ khi frequency/resolution trùng; servo 50 Hz/14-bit tách timer motor/PWM 8-bit. Motor chạy có thời hạn và stop hai PWM; hiện blocking, cần mốc tiếp theo cho điều khiển nhiều motor đồng thời. Không coi giới hạn cấp PWM là giới hạn dòng cơ khí.

Blockly thêm read sensor, if/else, PWM %, servo angle/release, motor timed run/stop; dropdown lọc đúng driver. Project cũ vẫn load được, source ownership không thay. Thêm thư viện ví dụ và project trống; mở ví dụ tải bản sao project cũ trước.

Server API 0.2 dùng cùng schema mới; frontend báo restart nếu bridge còn 0.1. Browser QA dùng cổng 3211 riêng để không tác động phiên người dùng 3210. Các quyết định ban đầu dưới đây được giữ làm lịch sử; phạm vi driver mới thay thế giới hạn GPIO-only của 0.1.

Nguồn yêu cầu: bản brief đã chốt và lịch sử hội thoại trong thư mục dự án. Ảnh ghi chú ban đầu không thay thế quyết định cuối cùng: C++ + Blockly, không MicroPython. Người dùng chọn ESP32 DevKit / ESP32-WROOM làm board thử đầu tiên trong phiên triển khai.

## Quyết định kỹ thuật của bản 0.1

Đây là lựa chọn của bước triển khai, không coi các mục chưa chốt trong brief là phê duyệt stack lâu dài.

| Lựa chọn | Lý do và đánh đổi |
| --- | --- |
| TypeScript + Vite, DOM native | Nhỏ, kiểm tra kiểu dữ liệu, tách được core khỏi UI; chưa cần framework ứng dụng/tài khoản. |
| Blockly, custom block → IR → C++ | Blockly thực sự kéo thả được. IR nhỏ dễ kiểm chứng; không dựa vào bộ sinh JavaScript để giả C++. |
| Zod + JSON v1 | GUI/import/server dùng chung validator. JSON không thêm parser YAML; có thể bổ sung chuyển đổi sau. |
| Arduino C++ / PlatformIO espressif32 6.12.0 | Toolchain hiện có trên máy; dễ đưa xuống ESP32, giữ quyền viết C++ trực tiếp. Dùng core 2.0.17 đi kèm bản platform, không mặc định core mới nhất. |
| Bridge Node.js tại 127.0.0.1:3210 | Build và upload bằng toolchain cục bộ, chưa cần tài khoản/server build trả phí. Frontend có thể chạy riêng; host static không chạy được toolchain này. |
| GPIO output trước | Chứng minh config đi vào code/build; tránh đoán pinout và driver motor chưa có tài liệu. |
| Khóa config trong code mode | Không viết đè manual C++ và không hiển thị cấu hình mới như thể đã cập nhật vào code cũ. |
| Lưu bản C++ khi quay lại block | Snapshot giữ nguyên; codeHistory giữ code và config tương ứng. Không có chuyển C++ → Blockly. |

## Ranh giới module

```text
src/core/config.ts   schema, target capabilities, board template, platformio.ini
src/core/program.ts IR, driver GPIO, generator, source ranges, project model
src/blocks.ts       Blockly blocks, serialization, workspace → IR
src/main.ts         UI, persistence, build/upload client, serial monitor
server/service.ts   validate, materialize immutable build dirs, invoke PlatformIO
server/index.ts     loopback HTTP API + static frontend
```

Board/config đã áp dụng là nguồn duy nhất cho dropdown thiết bị, khai báo chân, khởi tạo và build target. Bản nháp form/JSON không tự tác động lên chương trình. Không cho xóa/đổi định danh một thiết bị đang được block tham chiếu. Khi load snapshot, kiểm tra ID trước khi Blockly có thể thay giá trị dropdown không hợp lệ.

Mỗi build lưu source/config trong thư mục riêng; job upload chỉ tham chiếu build đã thành công và cổng có trong danh sách thực. UI so sánh config + code hiện tại với bản đã build; edit khi đang build vẫn được lưu nhưng không thể nạp nhầm bản cũ. Khởi động lại bridge yêu cầu build lại trước khi nạp.

Server không nhận raw shell command, board identifier hoặc build flag từ request. Target ánh xạ bằng registry trong core. Origin/Host/Fetch Metadata được kiểm tra, API cần token phiên, POST cần JSON, không bật CORS. Đây là boundary cho ứng dụng cục bộ tin cậy, không phải compiler sandbox cho nhiều người dùng.

## Mở rộng

Driver hiện tại có declaration/initialize/write tách riêng. Trước driver thứ hai, chuyển sang registry có schema riêng và bộ kiểm tra tài nguyên PWM/timer; không coi cấm trùng GPIO output hiện tại là quy tắc cho shared bus. Thêm board dùng driver đã có bằng config; driver/giao thức mới cần code và kiểm thử riêng.

AI nên dùng các thao tác có cấu trúc đọc project, đọc diagnostics, highlight block/range và xem diff đề xuất. `Generated.ranges` đã tạo điểm nối UI đầu tiên. Chưa có provider hoặc MCP runtime; không gọi phần hướng dẫn tĩnh là AI.

## Tài liệu tham khảo đã đối chiếu

- [Blockly save/load](https://developers.google.com/blockly/guides/configure/web/serialization): dùng workspace serialization JSON cho snapshot.
- [Blockly application design](https://docs.blockly.com/guides/design/applications/): kiến trúc workspace và generate code.
- [PlatformIO ESP32 Dev Module](https://docs.platformio.org/en/stable/boards/espressif32/esp32dev.html): target `esp32dev`.
- [PlatformIO Espressif32](https://docs.platformio.org/en/latest/platforms/espressif32.html): framework/build/upload.
- [Espressif GPIO ESP32](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html): chân input-only và chân dành cho flash/PSRAM. Bản đầu cố ý giới hạn tập GPIO hơn khả năng tối đa của chip.
- [ESP32-S3 DevKitC-1](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.0.html): các khác biệt module/flash/PSRAM; không nhận diện pinout từ USB.
