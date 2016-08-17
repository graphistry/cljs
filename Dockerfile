FROM graphistry/js-and-gpu:0.10.46

WORKDIR /app
COPY . /app
RUN bash -l -c "npm link"
WORKDIR /app/examples/convolutionDemo
RUN bash -l -c "npm link"
CMD npm start
