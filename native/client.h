#ifndef BOOTWEAVE_NATIVE_CLIENT_H
#define BOOTWEAVE_NATIVE_CLIENT_H

#include "common.h"
#include <sys/dispatch.h>
#include <sys/neutrino.h>

static inline int bw_client(const char *role, long period_ms, int argc, char **argv) {
    bw_sender_t sender;
    if (bw_sender_open(&sender, argc, argv) == -1) return EXIT_FAILURE;
    int connection = -1;
    uint64_t sequence = 0, successes = 0, errors = 0;
    printf("%s instance=%s pid=%ld sensor=%s\n", role, sender.instance, (long)getpid(), BW_SENSOR_NAME);
    fflush(stdout);
    while (bw_running) {
        ++sequence;
        bw_reply_t reply = {0};
        int valid_reply = 0;
        if (connection == -1) {
            uint64_t timeout = UINT64_C(250000000);
            if (TimerTimeout(CLOCK_MONOTONIC, _NTO_TIMEOUT_SEND | _NTO_TIMEOUT_REPLY,
                             NULL, &timeout, NULL) == 0)
                connection = name_open(BW_SENSOR_NAME, 0);
        }
        if (connection != -1) {
            bw_request_t request = {BW_SAMPLE_REQUEST, 0, BW_MAGIC, sequence};
            uint64_t timeout = UINT64_C(250000000);
            if (TimerTimeout(CLOCK_MONOTONIC, _NTO_TIMEOUT_SEND | _NTO_TIMEOUT_REPLY,
                             NULL, &timeout, NULL) == 0 &&
                MsgSend(connection, &request, sizeof(request), &reply, sizeof(reply)) == EOK &&
                reply.magic == BW_MAGIC && reply.request_sequence == sequence) {
                valid_reply = 1;
                ++successes;
            } else {
                name_close(connection);
                connection = -1;
            }
        }
        if (!valid_reply) ++errors;
        bw_emit(&sender, role, sequence, successes, errors, valid_reply ? &reply : NULL);
        bw_pause_ms(period_ms);
    }
    if (connection != -1) name_close(connection);
    close(sender.fd);
    return EXIT_SUCCESS;
}

#endif
