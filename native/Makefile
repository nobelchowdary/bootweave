QCC ?= qcc
VARIANT ?= gcc_ntox86_64
CFLAGS ?= -std=c11 -D_QNX_SOURCE -O2 -Wall -Wextra -Werror
LDLIBS ?= -lsocket
LDFLAGS ?= -Wl,--build-id=sha1
BUILD ?= build

.PHONY: all clean
all: $(BUILD)/bw-sensor $(BUILD)/bw-controller $(BUILD)/bw-telemetry

$(BUILD):
	mkdir -p "$@"

$(BUILD)/bw-sensor: sensor.c common.h | $(BUILD)
	$(QCC) -V$(VARIANT) $(CFLAGS) $(LDFLAGS) sensor.c -o "$@" $(LDLIBS)

$(BUILD)/bw-controller: controller.c client.h common.h | $(BUILD)
	$(QCC) -V$(VARIANT) $(CFLAGS) $(LDFLAGS) controller.c -o "$@" $(LDLIBS)

$(BUILD)/bw-telemetry: telemetry.c client.h common.h | $(BUILD)
	$(QCC) -V$(VARIANT) $(CFLAGS) $(LDFLAGS) telemetry.c -o "$@" $(LDLIBS)

clean:
	rm -rf "$(BUILD)"
