/* Optional observer of the sensor. Killing this process tests SLM coupling. */
#include "client.h"

int main(int argc, char **argv) {
    return bw_client("telemetry", 250, argc, argv);
}
