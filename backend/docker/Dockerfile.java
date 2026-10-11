FROM eclipse-temurin:17-jdk
WORKDIR /workspace

ENTRYPOINT ["bash", "-c"]
CMD ["javac Main.java && java Main"]
