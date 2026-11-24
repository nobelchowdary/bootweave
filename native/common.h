#ifndef BOOTWEAVE_NATIVE_COMMON_H
#define BOOTWEAVE_NATIVE_COMMON_H

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#define BW_SENSOR_NAME "bootweave-demo-sensor"
#define BW_SAMPLE_REQUEST 0x7001
#define BW_MAGIC UINT32_C(0x42574431)

typedef struct {
    uint16_t type;
    uint16_t subtype;
    uint32_t magic;
    uint64_t request_sequence;
} bw_request_t;

typedef struct {
    uint32_t magic;
    int32_t sensor_pid;
    uint64_t request_sequence;
    uint64_t sample;
} bw_reply_t;

typedef struct {
    int fd;
    struct sockaddr_in destination;
    char instance[80];
} bw_sender_t;

static volatile sig_atomic_t bw_running = 1;

static inline uint64_t bw_now_ns(void) {
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now) == -1) {
        perror("clock_gettime");
        exit(EXIT_FAILURE);
    }
    return (uint64_t)now.tv_sec * UINT64_C(1000000000) + (uint64_t)now.tv_nsec;
}

static inline void bw_signal(int number) {
    (void)number;
    bw_running = 0;
}

static inline int bw_sender_open(bw_sender_t *sender, int argc, char **argv) {
    memset(sender, 0, sizeof(*sender));
    sender->fd = -1;
    struct sigaction action;
    memset(&action, 0, sizeof(action));
    action.sa_handler = bw_signal;
    sigemptyset(&action.sa_mask);
    if (sigaction(SIGTERM, &action, NULL) == -1 || sigaction(SIGINT, &action, NULL) == -1) {
        perror("sigaction");
        return -1;
    }
    unsigned char bytes[16];
    int random_fd = open("/dev/urandom", O_RDONLY);
    ssize_t random_size = random_fd == -1 ? -1 : read(random_fd, bytes, sizeof(bytes));
    if (random_fd != -1) close(random_fd);
    if (random_size == (ssize_t)sizeof(bytes)) {
        for (size_t index = 0; index < sizeof(bytes); ++index) {
            snprintf(sender->instance + index * 2, 3, "%02x", bytes[index]);
        }
    } else {
        snprintf(sender->instance, sizeof(sender->instance), "pid-%ld-monotonic-%" PRIu64,
                 (long)getpid(), bw_now_ns());
    }
    long port = 19010;
    if (argc > 2) {
        char *end;
        port = strtol(argv[2], &end, 10);
        if (*end || port < 1 || port > 65535) {
            fprintf(stderr, "Invalid receiver port\n");
            return -1;
        }
    }
    sender->destination.sin_family = AF_INET;
    sender->destination.sin_port = htons((uint16_t)port);
    if (inet_pton(AF_INET, argc > 1 ? argv[1] : "10.0.2.2", &sender->destination.sin_addr) != 1) {
        fprintf(stderr, "Receiver must be an IPv4 address\n");
        return -1;
    }
    sender->fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sender->fd == -1 || fcntl(sender->fd, F_SETFL, O_NONBLOCK) == -1) {
        perror("UDP socket");
        if (sender->fd != -1) close(sender->fd);
        return -1;
    }
    return 0;
}

static inline void bw_pause_ms(long milliseconds) {
    struct timespec remaining = {milliseconds / 1000, milliseconds % 1000 * 1000000};
    while (bw_running && nanosleep(&remaining, &remaining) == -1 && errno == EINTR) {}
}

static inline void bw_emit(bw_sender_t *sender, const char *role, uint64_t sequence,
                           uint64_t ipc_successes, uint64_t ipc_errors,
                           const bw_reply_t *sample) {
    char observed_sample[120];
    if (sample) {
        snprintf(observed_sample, sizeof(observed_sample),
                 "\"sample\":%" PRIu64 ",\"sensor_pid\":%" PRId32,
                 sample->sample, sample->sensor_pid);
    } else {
        strcpy(observed_sample, "\"sample\":null,\"sensor_pid\":null");
    }
    char packet[640];
    int length = snprintf(packet, sizeof(packet),
        "{\"protocol\":\"bootweave.heartbeat.v1\",\"component\":\"%s\","
        "\"instance\":\"%s\",\"pid\":%ld,\"sequence\":%" PRIu64 ","
        "\"target_monotonic_ns\":%" PRIu64 ",\"ipc_successes\":%" PRIu64 ","
        "\"ipc_errors\":%" PRIu64 ",%s}",
        role, sender->instance, (long)getpid(), sequence, bw_now_ns(),
        ipc_successes, ipc_errors, observed_sample);
    if (length > 0 && (size_t)length < sizeof(packet)) {
        ssize_t sent = sendto(sender->fd, packet, (size_t)length, 0,
                             (struct sockaddr *)&sender->destination, sizeof(sender->destination));
        if (sent != length && sequence == 1) perror("heartbeat sendto");
    }
}

#endif
