

FROM gcc:latest
WORKDIR /workspace

ENTRYPOINT ["bash", "-c"]
CMD ["g++ code.cpp -o code && ./code"]
