/* Required sensor IPC; there is deliberately no telemetry dependency in code.
 * This is a software workload, not an actuator or a certified controller. */
#include "client.h"

int main(int argc, char **argv) {
    return bw_client("controller", 100, argc, argv);
}
