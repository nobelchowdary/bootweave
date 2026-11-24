/* An authored QNX name service. Samples are a software counter, not hardware. */
#include "common.h"
#include <sys/dispatch.h>
#include <sys/iomsg.h>
#include <sys/neutrino.h>

typedef struct {
    int in_use;
    int scoid;
    uint64_t last_request;
} client_session_t;

int main(int argc, char **argv) {
    bw_sender_t sender;
    if (bw_sender_open(&sender, argc, argv) == -1) return EXIT_FAILURE;
    name_attach_t *attachment = name_attach(NULL, BW_SENSOR_NAME, 0);
    if (!attachment) {
        perror("name_attach");
        close(sender.fd);
        return EXIT_FAILURE;
    }
    printf("sensor instance=%s pid=%ld name=%s\n", sender.instance, (long)getpid(), BW_SENSOR_NAME);
    fflush(stdout);
    client_session_t sessions[32] = {{0}};
    uint64_t samples = 0, successes = 0, errors = 0;
    while (bw_running) {
        union {struct _pulse pulse; bw_request_t request;} message;
        memset(&message, 0, sizeof(message));
        struct _msg_info info;
        int rcvid = MsgReceive(attachment->chid, &message, sizeof(message), &info);
        if (rcvid == -1) {
            if (errno == EINTR) continue;
            perror("MsgReceive");
            break;
        }
        if (rcvid == 0) {
            if (message.pulse.code == _PULSE_CODE_DISCONNECT) {
                for (size_t index = 0; index < 32; ++index) {
                    if (sessions[index].in_use && sessions[index].scoid == message.pulse.scoid)
                        sessions[index].in_use = 0;
                }
                ConnectDetach(message.pulse.scoid);
            } else if (message.pulse.code == _PULSE_CODE_UNBLOCK) {
                struct _msg_info pending;
                int blocked = message.pulse.value.sival_int;
                if (MsgInfo(blocked, &pending) == 0 && (pending.flags & _NTO_MI_UNBLOCK_REQ))
                    MsgError(blocked, EINTR);
            }
            continue;
        }
        if (message.request.type == _IO_CONNECT) {
            MsgReply(rcvid, EOK, NULL, 0);
            continue;
        }
        if (info.msglen < (int)sizeof(bw_request_t) || message.request.type != BW_SAMPLE_REQUEST ||
            message.request.magic != BW_MAGIC) {
            ++errors;
            MsgError(rcvid, ENOSYS);
            continue;
        }
        client_session_t *session = NULL, *empty = NULL;
        for (size_t index = 0; index < 32; ++index) {
            if (sessions[index].in_use && sessions[index].scoid == info.scoid) session = &sessions[index];
            if (!sessions[index].in_use && !empty) empty = &sessions[index];
        }
        if (!session && empty) {
            session = empty;
            *session = (client_session_t){1, info.scoid, 0};
        }
        if (!session || message.request.request_sequence <= session->last_request) {
            ++errors;
            MsgError(rcvid, session ? EPROTO : EBUSY);
            continue;
        }
        session->last_request = message.request.request_sequence;
        bw_reply_t reply = {BW_MAGIC, (int32_t)getpid(), message.request.request_sequence, ++samples};
        if (MsgReply(rcvid, EOK, &reply, sizeof(reply)) == -1) ++errors;
        else ++successes;
        bw_emit(&sender, "sensor", samples, successes, errors, &reply);
    }
    name_detach(attachment, 0);
    close(sender.fd);
    return EXIT_SUCCESS;
}
