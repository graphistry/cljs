FROM graphistry/js-and-gpu:7.4.0

WORKDIR /app
COPY . /app
RUN bash -l -c "npm link"
WORKDIR /app/examples/convolutionDemo
RUN bash -l -c "npm link"
WORKDIR /app
CMD bash -c "npm test && cd examples/convolutionDemo && npm start"
