CC = gcc
CFLAGS = -O2 -Wall -Wextra

all: test

test: test.c x25519.c x25519.h
	$(CC) $(CFLAGS) -o $@ test.c x25519.c

clean:
	rm -f test

.PHONY: all clean