default:
	docker build -t `cat Dockerfile.version` -t `cat Dockerfile.version | cut -d : -f 1` . && docker push `cat Dockerfile.version` && docker push `cat Dockerfile.version | cut -d : -f 1` && \
	docker build -t `cat Dockerfile-cpu.version` -t `cat Dockerfile-cpu.version | cut -d : -f 1` -f Dockerfile-cpu . && docker push `cat Dockerfile-cpu.version` && docker push `cat Dockerfile-cpu.version | cut -d : -f 1`
