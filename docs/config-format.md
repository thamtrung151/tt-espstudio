# Configuration v1 — driver set 0.2.1

Schema v1 giữ khả năng đọc project/config 0.1. Có thêm các loại thiết bị; app 0.1 không đọc được driver mới. Validator dùng chung frontend/server ở `src/core/config.ts`.

```json
{
  "schemaVersion": 1,
  "board": {
    "name": "DOIT ESP32 DevKit",
    "target": "esp32",
    "exposedPins": [2, 18, 19, 21, 25, 27, 34]
  },
  "devices": [
    { "id": "status_led", "label": "LED onboard", "driver": "gpio.output", "pin": 2, "activeLow": false },
    { "id": "button", "label": "Nút nhấn", "driver": "gpio.input", "pin": 27, "pull": "up", "activeLow": true },
    { "id": "sensor", "label": "Analog", "driver": "adc.input", "pin": 34, "attenuation": "11" },
    { "id": "dimmer", "label": "PWM", "driver": "pwm.output", "pin": 25, "frequencyHz": 1000 },
    { "id": "gripper", "label": "Servo", "driver": "servo.pwm", "pin": 18, "minUs": 1000, "maxUs": 2000 },
    { "id": "drive", "label": "Motor", "driver": "motor.hbridge2", "in1": 19, "in2": 21, "frequencyHz": 20000, "reversed": false }
  ]
}
```

Đây là ví dụ, không phải sơ đồ đã được chủ dự án xác nhận. `devices: []` hoàn toàn hợp lệ; không có chân motor bắt buộc khi chưa thêm motor.

## Quy tắc

- Board name tối đa 80 ký tự; target là esp32 hoặc esp32s3; exposedPins là danh sách chân do người dùng mô tả, có thể trống, không trùng. Số GPIO là số nguyên 0–255 (kiểu uint8_t). Không có kiểm tra whitelist để khóa chân theo board/module.
- ID thiết bị bắt đầu bằng chữ thường, chỉ chữ thường/số/gạch dưới, tối đa 32 ký tự, duy nhất. Là khóa ổn định của Blockly; label chỉ để hiển thị.
- GPIO2/0/5/12/15 trên ESP32 có thể dùng, nhưng có lưu ý strapping khi thiết bị sử dụng. GPIO12 được lưu ý thêm về điện áp flash khi reset.
- Thông tin GPIO input-only/pull/ADC, UART0, flash/PSRAM hoặc USB là advisory. Tất cả lựa chọn chân đều được giữ và sinh code, không bị khóa vì bảng khả năng của target. Người dùng đối chiếu với board thực tế; cho phép chọn trong Studio không làm thay đổi khả năng vật lý của chân.
- GUI và JSON cùng nguồn dữ liệu đã áp dụng. Bản nháp lỗi không thay cấu hình đang dùng. Không đổi/xóa ID hay driver đang được block tham chiếu.
- Pin có thể được khai báo cho nhiều thiết bị; Studio đưa thông tin dùng chung, không từ chối. Đây chưa phải driver bus hay bộ điều phối truy cập chung chân.
- GPIO input có pull `none/up/down`; activeLow ánh xạ LOW thành logical 1. ADC trả raw 0–4095, suy hao `0/2.5/6/11`; chưa hiển thị điện áp hiệu chuẩn. ADC2 có lưu ý khi dùng Wi-Fi.
- PWM 8-bit, 1–20000 Hz, block duty nguyên 0–100%. Servo 50 Hz, 14-bit; min/max từ 500–2500 µs và min < max. Mặc định 1000–2000 µs, góc danh định 0–180°.
- Motor `motor.hbridge2` chỉ có **in1, in2**. Cả hai là PWM, hai channel riêng. Không có `pwmPin` hoặc chân enable thứ ba trong schema này.

## Hành vi motor

| Lệnh | IN1 | IN2 |
| --- | --- | --- |
| Duty dương | PWM abs(duty) | LOW |
| Duty âm | LOW | PWM abs(duty) |
| Dừng | 0 | 0 |

Đảo chiều đổi dấu lệnh. Trước khi đổi chiều, đặt hai channel về 0 rồi chờ 50 µs. Block chạy từ 1–10000 ms rồi đưa cả hai về 0; phần trăm là **PWM duty**, không phải tốc độ vòng/phút hoặc công suất đo được. IC cầu H phải tương thích bảng trên; trạng thái cơ học khi 0/0 phụ thuộc IC. Chưa có brake mode, encoder, closed-loop hoặc điều khiển motor đồng thời. Hàm run hiện blocking; C++ tự do có thể vượt các ràng buộc của block.

## Timer và C++

Driver registry: `src/core/drivers.ts`. Cấp phát LEDC: `allocatePwm` trong config. Arduino core 2.x ánh xạ từng cặp channel vào một timer; chỉ chia timer khi trùng tần số và độ phân giải. Motor dùng hai channel, servo dùng một; ESP32 có 16 channel, S3 8. Hết tài nguyên thì lỗi config, không âm thầm đổi tần số thiết bị khác. Source map hỗ trợ tô các lệnh mới.

File project chứa config + Blockly JSON + mode + C++ + history. Schema project không thay; block mode sinh lại C++ từ snapshot, code mode giữ nguyên code. Quay về block luôn lưu C++/config vào history, không tự xóa quá 50 mục.

## Tham khảo

- [ESP32 GPIO và strapping](https://docs.espressif.com/projects/esp-idf/en/v5.1/esp32/api-reference/peripherals/gpio.html).
- [ESP32 ADC](https://docs.espressif.com/projects/esp-idf/en/v4.3/esp32/api-reference/peripherals/adc.html).
- [S3 ADC](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32s3/api-reference/peripherals/adc.html).
- API LEDC và mapping được đối chiếu trực tiếp với `framework-arduinoespressif32/cores/esp32/esp32-hal-ledc.c` phiên bản 2.0.17 trên máy. Không dùng tên API core 3.x với toolchain 2.x.
